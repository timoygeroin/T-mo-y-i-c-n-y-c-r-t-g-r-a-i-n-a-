export type PullRequestResolutionState = "open" | "closed";

export type PullRequestResolutionAction =
  | "continue_open_pr_embodiment"
  | "seal_merged_pr_sink"
  | "emit_closed_unmerged_pr_blocker"
  | "block_branch_mismatch"
  | "block_head_mismatch"
  | "block_missing_merge_receipt";

export interface PullRequestResolutionSurface {
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  state: PullRequestResolutionState;
  merged: boolean;
  merged_at?: string;
  merge_commit_sha?: string;
}

export interface PullRequestResolutionBoundaryInput {
  active_branch: string;
  expected_head_sha: string;
  merge_receipt_ids: string[];
  surface: PullRequestResolutionSurface;
}

export interface PullRequestResolutionBoundaryVerdict {
  ok: boolean;
  action: PullRequestResolutionAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function clean(value: string | undefined): string {
  return (value ?? "").trim();
}

function base(input: PullRequestResolutionBoundaryInput): Pick<
  PullRequestResolutionBoundaryVerdict,
  "repository_full_name" | "pr_number" | "branch" | "head_sha"
> {
  return {
    repository_full_name: input.surface.repository_full_name,
    pr_number: input.surface.pr_number,
    branch: input.surface.branch,
    head_sha: input.surface.head_sha,
  };
}

function evidence(input: PullRequestResolutionBoundaryInput): string[] {
  return [
    `PR #${input.surface.pr_number}`,
    `state ${input.surface.state}`,
    `merged ${input.surface.merged}`,
    `branch ${input.surface.branch}`,
    `head ${input.surface.head_sha}`,
    ...(clean(input.surface.merged_at) ? [`merged at ${input.surface.merged_at}`] : []),
    ...(clean(input.surface.merge_commit_sha) ? [`merge commit ${input.surface.merge_commit_sha}`] : []),
  ];
}

function block(
  input: PullRequestResolutionBoundaryInput,
  action: Exclude<
    PullRequestResolutionAction,
    "continue_open_pr_embodiment" | "seal_merged_pr_sink" | "emit_closed_unmerged_pr_blocker"
  >,
  blockers: string[],
  nextRoute: string,
): PullRequestResolutionBoundaryVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence(input),
    blockers,
    next_route: nextRoute,
  };
}

export function routePullRequestResolutionState(
  input: PullRequestResolutionBoundaryInput,
): PullRequestResolutionBoundaryVerdict {
  const routeEvidence = evidence(input);

  if (input.surface.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`PR surface branch ${input.surface.branch} does not match active branch ${input.active_branch}`],
      "re-enter the actual PR branch before selecting a manifestation sink",
    );
  }

  if (input.surface.head_sha !== input.expected_head_sha) {
    return block(
      input,
      "block_head_mismatch",
      [`PR surface head ${input.surface.head_sha} does not match expected head ${input.expected_head_sha}`],
      "rebuild finalization authority from the live PR head before issuing another embodiment command",
    );
  }

  if (input.surface.state === "open") {
    return {
      ...base(input),
      ok: true,
      action: "continue_open_pr_embodiment",
      decisive_evidence: routeEvidence,
      blockers: [],
      next_route: "continue with one non-repeated executable embodiment increment or a head-bound status readback after the branch moves",
    };
  }

  if (input.surface.merged) {
    const mergeCommit = clean(input.surface.merge_commit_sha);
    const hasMergeReceipt = input.merge_receipt_ids.length > 0;

    if (!mergeCommit || !hasMergeReceipt) {
      return block(
        input,
        "block_missing_merge_receipt",
        [
          ...(!mergeCommit ? ["closed merged PR surface has no merge commit SHA"] : []),
          ...(!hasMergeReceipt ? ["closed merged PR surface has no durable merge receipt id"] : []),
        ],
        "compile or attach the merge receipt before sealing the PR manifestation sink",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "seal_merged_pr_sink",
      decisive_evidence: [...routeEvidence, ...input.merge_receipt_ids.map((id) => `merge receipt ${id}`)],
      blockers: [],
      next_route: "stop adding PR #2 embodiment increments; promote the next manifestation target after the merged sink is sealed",
    };
  }

  return {
    ...base(input),
    ok: false,
    action: "emit_closed_unmerged_pr_blocker",
    decisive_evidence: routeEvidence,
    blockers: [`PR #${input.surface.pr_number} is closed without merge and cannot remain the active manifestation sink`],
    next_route: "reopen the PR, create a new PR from the branch, or replace the manifestation sink before continuing",
  };
}
