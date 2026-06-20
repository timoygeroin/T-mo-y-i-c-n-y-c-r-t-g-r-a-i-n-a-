export type FinalReviewExecutionWindowCommand =
  | "request_final_review"
  | "merge_finalization"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "duplicate_comment"
  | "metadata_reread"
  | "warning_maintenance";

export type FinalReviewExecutionWindowAction =
  | "open_final_review_execution_window"
  | "execute_final_review_command"
  | "emit_exact_external_blocker"
  | "block_branch_mismatch"
  | "block_head_mismatch"
  | "block_reused_window"
  | "block_non_progress_command"
  | "block_missing_lease"
  | "block_stale_lease"
  | "block_active_blocker"
  | "block_missing_exact_blocker";

export interface FinalReviewLease {
  lease_id: string;
  branch: string;
  head_sha: string;
  evidence: string[];
}

export interface FinalReviewExecutionWindowInput {
  active_branch: string;
  live_head_sha: string;
  window_id: string;
  spent_window_ids: string[];
  command: FinalReviewExecutionWindowCommand;
  status_lease?: FinalReviewLease;
  mergeability_lease?: FinalReviewLease;
  review_lease?: FinalReviewLease;
  active_blockers: string[];
  exact_blocker?: string;
}

export interface FinalReviewExecutionWindowVerdict {
  ok: boolean;
  action: FinalReviewExecutionWindowAction;
  window_id: string | null;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const EXECUTION_COMMANDS = new Set<FinalReviewExecutionWindowCommand>([
  "request_final_review",
  "merge_finalization",
]);

const NON_PROGRESS_COMMANDS = new Set<FinalReviewExecutionWindowCommand>([
  "duplicate_comment",
  "metadata_reread",
  "warning_maintenance",
]);

function base(input: FinalReviewExecutionWindowInput): Pick<
  FinalReviewExecutionWindowVerdict,
  "window_id" | "branch" | "head_sha"
> {
  return {
    window_id: input.window_id.trim() || null,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
  };
}

function block(
  input: FinalReviewExecutionWindowInput,
  action: Exclude<
    FinalReviewExecutionWindowAction,
    "open_final_review_execution_window" | "execute_final_review_command" | "emit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): FinalReviewExecutionWindowVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function requiredLeases(input: FinalReviewExecutionWindowInput): FinalReviewLease[] {
  return [input.status_lease, input.mergeability_lease, input.review_lease].filter(
    (lease): lease is FinalReviewLease => Boolean(lease),
  );
}

function leaseEvidence(lease: FinalReviewLease): string[] {
  return [lease.lease_id, `${lease.branch}:${lease.head_sha}`, ...lease.evidence];
}

export function routeFinalReviewExecutionWindow(
  input: FinalReviewExecutionWindowInput,
): FinalReviewExecutionWindowVerdict {
  const windowId = input.window_id.trim();
  const evidence = [`window ${windowId || "<missing>"}`, `live head ${input.live_head_sha}`];

  if (!windowId || input.spent_window_ids.includes(windowId)) {
    return block(
      input,
      "block_reused_window",
      [windowId ? `final review execution window already spent: ${windowId}` : "final review execution window has no id"],
      "compile a fresh single-use execution window for the live PR head",
      evidence,
    );
  }

  if (NON_PROGRESS_COMMANDS.has(input.command)) {
    return block(
      input,
      "block_non_progress_command",
      [`${input.command} cannot consume final review execution authority as progress`],
      "choose final review request, merge finalization, fresh status readback, or one exact external blocker",
      evidence,
    );
  }

  if (input.command === "exact_external_blocker") {
    const blocker = input.exact_blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_missing_exact_blocker",
        ["final review execution blocker command has no blocker text"],
        "name the exact external blocker or open a live-head execution window",
        evidence,
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_exact_external_blocker",
      decisive_evidence: [...evidence, blocker],
      blockers: [blocker],
      next_route: "remove the named blocker before consuming final review execution authority",
    };
  }

  const leases = requiredLeases(input);
  if (leases.length !== 3) {
    return block(
      input,
      "block_missing_lease",
      ["final review execution requires status, mergeability, and review leases"],
      "attach all three live-head leases before requesting final review or merge finalization",
      evidence,
    );
  }

  const wrongBranch = leases.find((lease) => lease.branch !== input.active_branch);
  if (wrongBranch) {
    return block(
      input,
      "block_branch_mismatch",
      [`lease ${wrongBranch.lease_id} is on ${wrongBranch.branch}, not ${input.active_branch}`],
      "rebuild the execution window from active-branch leases only",
      [...evidence, ...leaseEvidence(wrongBranch)],
    );
  }

  const wrongHead = leases.find((lease) => lease.head_sha !== input.live_head_sha);
  if (wrongHead) {
    return block(
      input,
      "block_head_mismatch",
      [`lease ${wrongHead.lease_id} belongs to ${wrongHead.head_sha}, not live head ${input.live_head_sha}`],
      "discard stale leases and rebuild from the current PR head before final review execution",
      [...evidence, ...leaseEvidence(wrongHead)],
    );
  }

  if (input.active_blockers.length > 0) {
    return block(
      input,
      "block_active_blocker",
      input.active_blockers,
      "retire or name the active external blocker before consuming final review execution authority",
      evidence,
    );
  }

  const decisiveEvidence = [...evidence, ...leases.flatMap(leaseEvidence)];
  if (EXECUTION_COMMANDS.has(input.command)) {
    return {
      ...base(input),
      ok: true,
      action: "execute_final_review_command",
      decisive_evidence: [`command ${input.command}`, ...decisiveEvidence],
      blockers: [],
      next_route: "execute the command once; any branch movement or review/status change requires a new execution window",
    };
  }

  return {
    ...base(input),
    ok: true,
    action: "open_final_review_execution_window",
    decisive_evidence: decisiveEvidence,
    blockers: [],
    next_route: "use this single-use window for final review or merge finalization while the live head remains unchanged",
  };
}
