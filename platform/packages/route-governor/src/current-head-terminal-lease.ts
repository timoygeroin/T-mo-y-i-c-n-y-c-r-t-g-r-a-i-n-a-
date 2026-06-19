export type CurrentHeadTerminalStatusKind =
  | "current_head_checks"
  | "repaired_head_checks"
  | "pr_body_summary"
  | "memory_receipt"
  | "metadata_reread";

export type CurrentHeadTerminalOperation =
  | "merge_live_head"
  | "request_review"
  | "commit_external_embodiment"
  | "emit_exact_external_blocker";

export type CurrentHeadTerminalLeaseAction =
  | "admit_current_head_terminal_lease"
  | "block_stale_status_head"
  | "block_non_status_authority"
  | "block_repeated_lease"
  | "block_bundled_terminal_operations"
  | "block_missing_passing_status"
  | "block_missing_mergeability"
  | "block_missing_terminal_evidence";

export interface CurrentHeadTerminalStatusSource {
  source_id: string;
  kind: CurrentHeadTerminalStatusKind;
  branch: string;
  head_sha?: string;
  passed: boolean;
  warnings: string[];
  evidence: string[];
}

export interface CurrentHeadTerminalLeaseInput {
  active_branch: string;
  live_head_sha: string;
  lease_id: string;
  spent_lease_ids: string[];
  status_source: CurrentHeadTerminalStatusSource;
  mergeable?: boolean | null;
  terminal_operations: CurrentHeadTerminalOperation[];
  behavior_artifacts: string[];
  blocker?: string;
}

export interface CurrentHeadTerminalLeaseVerdict {
  ok: boolean;
  action: CurrentHeadTerminalLeaseAction;
  branch: string;
  head_sha: string;
  lease_id: string | null;
  operation: CurrentHeadTerminalOperation | null;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

function executableBehaviorArtifact(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    /\.(ts|js|mjs|json)$/.test(path) &&
    !/(?:\.test|-proof)\.ts$/.test(path)
  );
}

function base(input: CurrentHeadTerminalLeaseInput): Pick<
  CurrentHeadTerminalLeaseVerdict,
  "branch" | "head_sha" | "lease_id" | "warnings"
> {
  return {
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    lease_id: input.lease_id.trim() || null,
    warnings: input.status_source.warnings,
  };
}

function block(
  input: CurrentHeadTerminalLeaseInput,
  action: Exclude<CurrentHeadTerminalLeaseAction, "admit_current_head_terminal_lease">,
  blockers: string[],
  nextRoute: string,
): CurrentHeadTerminalLeaseVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    operation: null,
    decisive_evidence: [input.status_source.source_id, ...input.status_source.evidence],
    blockers,
    next_route: nextRoute,
  };
}

export function compileCurrentHeadTerminalLease(
  input: CurrentHeadTerminalLeaseInput,
): CurrentHeadTerminalLeaseVerdict {
  const status = input.status_source;
  const leaseId = input.lease_id.trim();

  if (status.kind !== "current_head_checks") {
    return block(
      input,
      "block_non_status_authority",
      [`terminal lease cannot use ${status.kind} as current-head status authority`],
      "read the current-head checks surface before issuing any terminal lease",
    );
  }

  if (status.branch !== input.active_branch || status.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_status_head",
      [
        `status source branch/head ${status.branch}/${status.head_sha ?? "<missing>"} does not match ${input.active_branch}/${input.live_head_sha}`,
      ],
      "discard stale status and bind the terminal lease to the live PR head",
    );
  }

  if (!leaseId || input.spent_lease_ids.includes(leaseId)) {
    return block(
      input,
      "block_repeated_lease",
      [leaseId ? `current-head terminal lease already spent: ${leaseId}` : "current-head terminal lease has no id"],
      "issue one fresh terminal lease id for the next single terminal consumer",
    );
  }

  if (input.terminal_operations.length !== 1) {
    return block(
      input,
      "block_bundled_terminal_operations",
      [`terminal lease requires exactly one operation, received ${input.terminal_operations.length}`],
      "choose one terminal consumer: merge, review request, external embodiment, or exact blocker",
    );
  }

  if (!status.passed) {
    return block(
      input,
      "block_missing_passing_status",
      [`current-head status source ${status.source_id} is not passing`],
      "repair or wait for passing current-head checks before terminal consumption",
    );
  }

  const operation = input.terminal_operations[0];

  if (operation === "merge_live_head" && input.mergeable !== true) {
    return block(
      input,
      "block_missing_mergeability",
      ["merge terminal lease requires live PR metadata mergeable true"],
      "read live PR mergeability for this head before admitting a merge terminal lease",
    );
  }

  if (operation === "commit_external_embodiment" && !input.behavior_artifacts.some(executableBehaviorArtifact)) {
    return block(
      input,
      "block_missing_terminal_evidence",
      ["external embodiment terminal lease has no behavior-bearing executable artifact"],
      "attach a behavior-bearing platform artifact before claiming an embodiment terminal consumer",
    );
  }

  if (operation === "emit_exact_external_blocker" && !input.blocker?.trim()) {
    return block(
      input,
      "block_missing_terminal_evidence",
      ["exact blocker terminal lease has no blocker text"],
      "name the exact external blocker instead of consuming passing current-head status",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_current_head_terminal_lease",
    operation,
    decisive_evidence: [
      `lease ${leaseId}`,
      `operation ${operation}`,
      `live head ${input.live_head_sha}`,
      `status source ${status.source_id}`,
      ...status.evidence,
      ...input.behavior_artifacts,
      ...(input.blocker ? [input.blocker] : []),
    ],
    blockers: [],
    next_route:
      "after this terminal consumer runs, require a moved-head status readback or a fresh terminal lease before any further terminal action",
  };
}
