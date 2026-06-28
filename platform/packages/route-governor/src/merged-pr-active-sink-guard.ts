export type MergedPrActiveSinkGuardAction =
  | "admit_active_pr_sink"
  | "route_to_successor_sink"
  | "emit_consumed_sink_blocker"
  | "block_wrong_sink_surface"
  | "block_stale_observed_head";

export interface ObservedActivePullRequestSink {
  pr_number: number;
  branch: string;
  head_sha: string;
  state: "open" | "closed";
  merged: boolean;
  merge_commit_sha?: string | null;
}

export interface MergedPrActiveSinkGuardInput {
  expected_pr_number: number;
  expected_branch: string;
  expected_head_sha: string;
  observed: ObservedActivePullRequestSink;
  successor_sink_available: boolean;
  successor_sink_id?: string;
}

export interface MergedPrActiveSinkGuardVerdict {
  ok: boolean;
  action: MergedPrActiveSinkGuardAction;
  pr_number: number;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function base(input: MergedPrActiveSinkGuardInput): Pick<
  MergedPrActiveSinkGuardVerdict,
  "pr_number" | "branch" | "head_sha"
> {
  return {
    pr_number: input.expected_pr_number,
    branch: input.expected_branch,
    head_sha: input.expected_head_sha,
  };
}

function evidence(input: MergedPrActiveSinkGuardInput): string[] {
  return [
    `expected PR #${input.expected_pr_number}`,
    `expected branch ${input.expected_branch}`,
    `expected head ${input.expected_head_sha}`,
    `observed PR #${input.observed.pr_number}`,
    `observed branch ${input.observed.branch}`,
    `observed head ${input.observed.head_sha}`,
    `observed state ${input.observed.state}`,
    `observed merged ${input.observed.merged}`,
    ...(input.observed.merge_commit_sha ? [`merge commit ${input.observed.merge_commit_sha}`] : []),
  ];
}

function block(
  input: MergedPrActiveSinkGuardInput,
  action: Exclude<MergedPrActiveSinkGuardAction, "admit_active_pr_sink" | "route_to_successor_sink">,
  blockers: string[],
  nextRoute: string,
): MergedPrActiveSinkGuardVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence(input),
    blockers,
    next_route: nextRoute,
  };
}

export function guardMergedPrActiveSink(
  input: MergedPrActiveSinkGuardInput,
): MergedPrActiveSinkGuardVerdict {
  if (input.observed.pr_number !== input.expected_pr_number || input.observed.branch !== input.expected_branch) {
    return block(
      input,
      "block_wrong_sink_surface",
      [
        `observed sink PR #${input.observed.pr_number}/${input.observed.branch} does not match expected PR #${input.expected_pr_number}/${input.expected_branch}`,
      ],
      "re-enter through the externally observed active PR surface before finalization routing",
    );
  }

  if (input.observed.head_sha !== input.expected_head_sha) {
    return block(
      input,
      "block_stale_observed_head",
      [`observed head ${input.observed.head_sha} does not match expected head ${input.expected_head_sha}`],
      "perform a fresh head-bound readback before choosing embodiment, successor, or blocker routing",
    );
  }

  if (input.observed.state === "open" && !input.observed.merged) {
    return {
      ...base(input),
      ok: true,
      action: "admit_active_pr_sink",
      decisive_evidence: evidence(input),
      blockers: [],
      next_route: "continue with one non-repeated executable embodiment increment on the active PR branch",
    };
  }

  const consumedBlocker = `PR #${input.expected_pr_number} on ${input.expected_branch} is merged/closed at ${input.expected_head_sha} and cannot be reused as the active embodiment sink`;

  if (input.observed.merged && input.observed.merge_commit_sha && input.successor_sink_available) {
    return {
      ...base(input),
      ok: true,
      action: "route_to_successor_sink",
      decisive_evidence: [
        ...evidence(input),
        `successor sink ${input.successor_sink_id?.trim() || "available"}`,
      ],
      blockers: [],
      next_route: "continue on the successor sink; do not add PR #2 branch increments after merge completion",
    };
  }

  return block(
    input,
    "emit_consumed_sink_blocker",
    [consumedBlocker],
    "create an open successor PR or distinct successor branch before the next external platform embodiment increment",
  );
}
