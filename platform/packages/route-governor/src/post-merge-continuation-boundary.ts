export type PostMergePullRequestState = "open" | "closed";

export type PostMergeContinuationProgressClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker";

export type PostMergeContinuationAction =
  | "continue_on_open_pull_request"
  | "route_to_branch_followup_surface"
  | "require_new_external_surface"
  | "emit_exact_external_blocker"
  | "block_reused_boundary"
  | "block_head_mismatch"
  | "block_missing_merge_receipt"
  | "block_missing_exact_blocker";

export interface PostMergeContinuationBoundaryInput {
  repository_full_name: string;
  pr_number: number;
  active_branch: string;
  live_head_sha: string;
  pr_head_sha: string;
  pr_state: PostMergePullRequestState;
  merged: boolean;
  merge_commit_sha?: string;
  boundary_id: string;
  spent_boundary_ids: string[];
  requested_progress_class: PostMergeContinuationProgressClass;
  branch_followup_allowed: boolean;
  blocker?: string;
}

export interface PostMergeContinuationBoundaryVerdict {
  ok: boolean;
  action: PostMergeContinuationAction;
  boundary_id: string | null;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  merge_commit_sha: string | null;
  admitted_progress_class: PostMergeContinuationProgressClass | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function base(input: PostMergeContinuationBoundaryInput): Pick<
  PostMergeContinuationBoundaryVerdict,
  "boundary_id" | "repository_full_name" | "pr_number" | "branch" | "head_sha" | "merge_commit_sha"
> {
  return {
    boundary_id: input.boundary_id.trim() || null,
    repository_full_name: input.repository_full_name,
    pr_number: input.pr_number,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    merge_commit_sha: input.merge_commit_sha?.trim() || null,
  };
}

function evidence(input: PostMergeContinuationBoundaryInput): string[] {
  return [
    `boundary ${input.boundary_id.trim() || "<missing>"}`,
    `pr ${input.pr_number}`,
    `pr state ${input.pr_state}`,
    `merged ${input.merged}`,
    `branch ${input.active_branch}`,
    `live head ${input.live_head_sha}`,
    `pr head ${input.pr_head_sha}`,
    ...(input.merge_commit_sha?.trim() ? [`merge commit ${input.merge_commit_sha.trim()}`] : []),
  ];
}

function block(
  input: PostMergeContinuationBoundaryInput,
  action: Exclude<
    PostMergeContinuationAction,
    | "continue_on_open_pull_request"
    | "route_to_branch_followup_surface"
    | "require_new_external_surface"
    | "emit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
): PostMergeContinuationBoundaryVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    admitted_progress_class: null,
    decisive_evidence: evidence(input),
    blockers,
    next_route: nextRoute,
  };
}

export function routePostMergeContinuationBoundary(
  input: PostMergeContinuationBoundaryInput,
): PostMergeContinuationBoundaryVerdict {
  const boundaryId = input.boundary_id.trim();

  if (!boundaryId || input.spent_boundary_ids.includes(boundaryId)) {
    return block(
      input,
      "block_reused_boundary",
      [boundaryId ? `post-merge continuation boundary already spent: ${boundaryId}` : "post-merge continuation boundary has no id"],
      "compile a fresh boundary from the current GitHub PR metadata before continuing",
    );
  }

  if (input.pr_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_head_mismatch",
      [`PR head ${input.pr_head_sha} is not live branch head ${input.live_head_sha}`],
      "rebind the continuation boundary to the current branch head before selecting progress",
    );
  }

  if (input.requested_progress_class === "exact_external_blocker") {
    const blocker = input.blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_missing_exact_blocker",
        ["post-merge exact blocker progress has no blocker text"],
        "name the exact external blocker or choose a branch-followup/new-surface route",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_exact_external_blocker",
      admitted_progress_class: "exact_external_blocker",
      decisive_evidence: [...evidence(input), blocker],
      blockers: [blocker],
      next_route: "remove the named post-merge blocker before another continuation move",
    };
  }

  if (input.pr_state === "open" && !input.merged) {
    return {
      ...base(input),
      ok: true,
      action: "continue_on_open_pull_request",
      admitted_progress_class: input.requested_progress_class,
      decisive_evidence: evidence(input),
      blockers: [],
      next_route: "continue on the open PR surface with exactly one admitted progress class",
    };
  }

  if (input.merged && !input.merge_commit_sha?.trim()) {
    return block(
      input,
      "block_missing_merge_receipt",
      ["GitHub reports the PR merged but no merge commit SHA is attached"],
      "read or supply the merge commit SHA before treating the PR surface as terminal",
    );
  }

  if (input.merged && input.branch_followup_allowed) {
    return {
      ...base(input),
      ok: true,
      action: "route_to_branch_followup_surface",
      admitted_progress_class: input.requested_progress_class,
      decisive_evidence: evidence(input),
      blockers: [],
      next_route: "treat PR continuation as terminal; only branch-bound follow-up or a new external surface may carry further embodiment",
    };
  }

  return {
    ...base(input),
    ok: false,
    action: "require_new_external_surface",
    admitted_progress_class: null,
    decisive_evidence: evidence(input),
    blockers: [
      input.merged
        ? `PR #${input.pr_number} is merged and cannot remain the active open PR manifestation sink`
        : `PR #${input.pr_number} is closed without merge and cannot carry continuation progress`,
    ],
    next_route: "open or name a new external continuation surface before writing another embodiment increment",
  };
}
