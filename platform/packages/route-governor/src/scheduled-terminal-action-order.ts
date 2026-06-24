export type ScheduledTerminalCandidateKind =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "metadata_reread"
  | "duplicate_ci_summary"
  | "duplicate_comment"
  | "duplicate_label"
  | "local_memory_guard"
  | "guessed_future_ci"
  | "reclose_completed_blocker"
  | "old_repaired_head_blocker";

export type ScheduledTerminalAction =
  | "admit_external_platform_embodiment"
  | "admit_fresh_status_readback"
  | "emit_exact_external_blocker"
  | "block_missing_order_id"
  | "block_reused_order"
  | "block_non_progress_candidate"
  | "block_stale_candidate_head"
  | "block_stale_prompt_head"
  | "block_repaired_head_replay"
  | "block_duplicate_candidate"
  | "block_incomplete_embodiment"
  | "block_unearned_status_readback"
  | "block_missing_exact_blocker"
  | "block_no_terminal_candidate";

export interface ScheduledTerminalCandidate {
  candidate_id: string;
  kind: ScheduledTerminalCandidateKind;
  branch: string;
  head_sha: string;
  evidence: string[];
  changed_files?: string[];
  behavior_exports?: string[];
  routing_effects?: string[];
  check_run_ids?: string[];
  exact_blocker?: string;
}

export interface ScheduledTerminalActionOrderInput {
  order_id: string;
  active_branch: string;
  live_head_sha: string;
  prompt_head_sha?: string;
  previous_status_head_sha?: string;
  repaired_historical_heads: string[];
  spent_order_ids: string[];
  spent_candidate_ids: string[];
  candidates: ScheduledTerminalCandidate[];
}

export interface ScheduledTerminalActionOrderVerdict {
  ok: boolean;
  action: ScheduledTerminalAction;
  order_id: string | null;
  branch: string;
  head_sha: string;
  admitted_candidate_id: string | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_CANDIDATES = new Set<ScheduledTerminalCandidateKind>([
  "metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "guessed_future_ci",
  "reclose_completed_blocker",
  "old_repaired_head_blocker",
]);

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function behaviorPath(path: string): boolean {
  return (
    executablePlatformPath(path) &&
    path !== "platform/packages/route-governor/package.json" &&
    path !== "platform/packages/route-governor/src/index.ts" &&
    !/(?:\.test|-proof)\.ts$/.test(path)
  );
}

function base(input: ScheduledTerminalActionOrderInput): Pick<
  ScheduledTerminalActionOrderVerdict,
  "order_id" | "branch" | "head_sha"
> {
  return {
    order_id: input.order_id.trim() || null,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
  };
}

function block(
  input: ScheduledTerminalActionOrderInput,
  action: Exclude<
    ScheduledTerminalAction,
    "admit_external_platform_embodiment" | "admit_fresh_status_readback" | "emit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ScheduledTerminalActionOrderVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    admitted_candidate_id: null,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function candidateEvidence(candidate: ScheduledTerminalCandidate): string[] {
  return [
    `candidate ${candidate.candidate_id.trim() || "<missing>"}`,
    `kind ${candidate.kind}`,
    `head ${candidate.head_sha}`,
    ...candidate.evidence,
    ...(candidate.changed_files ?? []),
    ...(candidate.behavior_exports ?? []),
    ...(candidate.routing_effects ?? []),
    ...(candidate.check_run_ids ?? []),
  ];
}

function candidatePriority(candidate: ScheduledTerminalCandidate): number {
  switch (candidate.kind) {
    case "external_platform_embodiment":
      return 3;
    case "fresh_status_readback":
      return 2;
    case "exact_external_blocker":
      return 1;
    default:
      return 0;
  }
}

function isCurrentBranchHead(input: ScheduledTerminalActionOrderInput, candidate: ScheduledTerminalCandidate): boolean {
  return candidate.branch === input.active_branch && candidate.head_sha === input.live_head_sha;
}

function embodimentBlockers(candidate: ScheduledTerminalCandidate): string[] {
  const blockers: string[] = [];
  const changedFiles = candidate.changed_files ?? [];

  if (!changedFiles.some(behaviorPath)) blockers.push("embodiment candidate changes no behavior-bearing platform file");
  if ((candidate.behavior_exports ?? []).length === 0) blockers.push("embodiment candidate exposes no behavior export");
  if ((candidate.routing_effects ?? []).length === 0) blockers.push("embodiment candidate has no future-routing effect");

  return blockers;
}

function statusReadbackEarned(input: ScheduledTerminalActionOrderInput, candidate: ScheduledTerminalCandidate): boolean {
  const headMovedSinceStatus = Boolean(input.previous_status_head_sha && input.previous_status_head_sha !== input.live_head_sha);
  const newCurrentHeadChecks = (candidate.check_run_ids ?? []).length > 0;

  return headMovedSinceStatus || newCurrentHeadChecks;
}

function decisiveTerminalCandidates(
  input: ScheduledTerminalActionOrderInput,
): ScheduledTerminalCandidate[] {
  return input.candidates
    .filter((candidate) => candidate.candidate_id.trim())
    .filter((candidate) => !input.spent_candidate_ids.includes(candidate.candidate_id))
    .filter((candidate) => !NON_PROGRESS_CANDIDATES.has(candidate.kind))
    .filter((candidate) => isCurrentBranchHead(input, candidate))
    .sort((left, right) => candidatePriority(right) - candidatePriority(left));
}

export function compileScheduledTerminalActionOrder(
  input: ScheduledTerminalActionOrderInput,
): ScheduledTerminalActionOrderVerdict {
  const orderId = input.order_id.trim();
  const orderEvidence = [`order ${orderId || "<missing>"}`, `live head ${input.live_head_sha}`];

  if (!orderId) {
    return block(
      input,
      "block_missing_order_id",
      ["scheduled terminal action order has no id"],
      "issue a fresh order id before this scheduled run can release progress",
      orderEvidence,
    );
  }

  if (input.spent_order_ids.includes(orderId)) {
    return block(
      input,
      "block_reused_order",
      [`scheduled terminal action order already spent: ${orderId}`],
      "compile a fresh terminal order before choosing the next progress action",
      orderEvidence,
    );
  }

  if (input.prompt_head_sha && input.prompt_head_sha !== input.live_head_sha) {
    const promptHeadIsHistoricalRepair = input.repaired_historical_heads.includes(input.prompt_head_sha);
    return block(
      input,
      promptHeadIsHistoricalRepair ? "block_repaired_head_replay" : "block_stale_prompt_head",
      [
        promptHeadIsHistoricalRepair
          ? `prompt head ${input.prompt_head_sha} is a repaired historical head, not the live PR head`
          : `prompt head ${input.prompt_head_sha} is not live head ${input.live_head_sha}`,
      ],
      "bind the scheduled terminal order to the live PR head before admitting status, blocker, or embodiment progress",
      orderEvidence,
    );
  }

  const repairedReplay = input.candidates.find((candidate) => input.repaired_historical_heads.includes(candidate.head_sha));
  if (repairedReplay && repairedReplay.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_repaired_head_replay",
      [`candidate ${repairedReplay.candidate_id} reuses repaired historical head ${repairedReplay.head_sha}`],
      "discard repaired-head candidates after the PR branch has moved",
      [...orderEvidence, ...candidateEvidence(repairedReplay)],
    );
  }

  const staleCandidate = input.candidates.find(
    (candidate) => candidate.branch === input.active_branch && candidate.head_sha !== input.live_head_sha,
  );
  if (staleCandidate) {
    return block(
      input,
      "block_stale_candidate_head",
      [`candidate ${staleCandidate.candidate_id} is bound to ${staleCandidate.head_sha}, not live head ${input.live_head_sha}`],
      "refresh terminal candidates against the live PR head before release",
      [...orderEvidence, ...candidateEvidence(staleCandidate)],
    );
  }

  const nonProgress = input.candidates.find((candidate) => NON_PROGRESS_CANDIDATES.has(candidate.kind));
  if (nonProgress) {
    return block(
      input,
      "block_non_progress_candidate",
      [`${nonProgress.kind} cannot count as scheduled terminal progress`],
      "choose external embodiment, earned current-head status readback, or one exact external blocker",
      [...orderEvidence, ...candidateEvidence(nonProgress)],
    );
  }

  const duplicateCandidate = input.candidates.find((candidate) => input.spent_candidate_ids.includes(candidate.candidate_id));
  if (duplicateCandidate) {
    return block(
      input,
      "block_duplicate_candidate",
      [`candidate already spent: ${duplicateCandidate.candidate_id}`],
      "choose a semantically new terminal candidate for this live head",
      [...orderEvidence, ...candidateEvidence(duplicateCandidate)],
    );
  }

  const selected = decisiveTerminalCandidates(input)[0];
  if (!selected) {
    return block(
      input,
      "block_no_terminal_candidate",
      ["no current-head terminal candidate survived scheduled action ordering"],
      "supply one live-head external embodiment, earned status readback, or exact external blocker candidate",
      orderEvidence,
    );
  }

  if (selected.kind === "external_platform_embodiment") {
    const blockers = embodimentBlockers(selected);
    if (blockers.length > 0) {
      return block(
        input,
        "block_incomplete_embodiment",
        blockers,
        "attach behavior-bearing files, behavior exports, and future-routing effects before writing",
        [...orderEvidence, ...candidateEvidence(selected)],
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_external_platform_embodiment",
      admitted_candidate_id: selected.candidate_id,
      decisive_evidence: [...orderEvidence, ...candidateEvidence(selected)],
      blockers: [],
      next_route: "write the admitted executable embodiment and treat the resulting moved head as requiring its own status authority",
    };
  }

  if (selected.kind === "fresh_status_readback") {
    if (!statusReadbackEarned(input, selected)) {
      return block(
        input,
        "block_unearned_status_readback",
        ["fresh status readback has neither a moved head since previous status nor new current-head check runs"],
        "choose executable embodiment or an exact blocker instead of duplicating status readback",
        [...orderEvidence, ...candidateEvidence(selected)],
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_fresh_status_readback",
      admitted_candidate_id: selected.candidate_id,
      decisive_evidence: [...orderEvidence, ...candidateEvidence(selected)],
      blockers: [],
      next_route: "perform the live-head status readback and spend this order id",
    };
  }

  const blocker = selected.exact_blocker?.trim();
  if (!blocker) {
    return block(
      input,
      "block_missing_exact_blocker",
      [`candidate ${selected.candidate_id} is an exact-blocker route without blocker text`],
      "name the exact external blocker or choose executable embodiment",
      [...orderEvidence, ...candidateEvidence(selected)],
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "emit_exact_external_blocker",
    admitted_candidate_id: selected.candidate_id,
    decisive_evidence: [...orderEvidence, ...candidateEvidence(selected), blocker],
    blockers: [blocker],
    next_route: "remove the exact external blocker before compiling another scheduled terminal action order",
  };
}
