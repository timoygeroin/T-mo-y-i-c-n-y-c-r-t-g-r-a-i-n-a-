export type PostReviewConvergenceStatusVerdict =
  | "passing"
  | "passing_with_warnings"
  | "pending"
  | "failing"
  | "no_status_surface";

export type PostReviewConvergenceReviewState =
  | "approved"
  | "changes_requested"
  | "commented"
  | "pending"
  | "dismissed"
  | "missing";

export type PostReviewConvergenceIntent =
  | "merge_command"
  | "repair_review"
  | "wait_review"
  | "external_platform_embodiment"
  | "warning_maintenance"
  | "metadata_reread"
  | "duplicate_status_summary"
  | "exact_external_blocker";

export type PostReviewConvergenceAction =
  | "admit_merge_window"
  | "route_to_review_repair"
  | "wait_for_live_review"
  | "route_to_external_embodiment"
  | "emit_exact_external_blocker"
  | "block_branch_mismatch"
  | "block_stale_status_surface"
  | "block_live_status_not_passing"
  | "block_unready_pr"
  | "block_stale_review_surface"
  | "block_non_progress_intent"
  | "block_missing_exact_blocker";

export interface PostReviewConvergenceStatusSurface {
  surface_id: string;
  head_sha: string;
  verdict: PostReviewConvergenceStatusVerdict;
  decisive_successes: string[];
  blockers: string[];
  warnings: string[];
}

export interface PostReviewConvergenceReviewSurface {
  reviewer: string;
  head_sha: string;
  state: PostReviewConvergenceReviewState;
  submitted_at?: string;
}

export interface PostReviewConvergenceInput {
  repository_full_name: string;
  pr_number: number;
  active_branch: string;
  candidate_branch: string;
  live_head_sha: string;
  draft: boolean;
  mergeable: boolean;
  required_approval_count: number;
  requested_intent: PostReviewConvergenceIntent;
  status_surface: PostReviewConvergenceStatusSurface;
  review_surfaces: PostReviewConvergenceReviewSurface[];
  exact_blocker?: string;
}

export interface PostReviewConvergenceVerdict {
  ok: boolean;
  action: PostReviewConvergenceAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  approvals: string[];
  change_requests: string[];
  blockers: string[];
  warnings: string[];
  decisive_evidence: string[];
  next_route: string;
}

const NON_PROGRESS_INTENTS = new Set<PostReviewConvergenceIntent>([
  "warning_maintenance",
  "metadata_reread",
  "duplicate_status_summary",
]);

function normalize(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function passing(surface: PostReviewConvergenceStatusSurface): boolean {
  return (
    (surface.verdict === "passing" || surface.verdict === "passing_with_warnings") &&
    surface.decisive_successes.length > 0 &&
    surface.blockers.length === 0
  );
}

function liveReviews(input: PostReviewConvergenceInput): PostReviewConvergenceReviewSurface[] {
  return input.review_surfaces
    .filter((surface) => surface.head_sha === input.live_head_sha)
    .sort((left, right) => left.reviewer.localeCompare(right.reviewer));
}

function staleReviewHeads(input: PostReviewConvergenceInput): string[] {
  return normalize(
    input.review_surfaces
      .filter((surface) => surface.head_sha !== input.live_head_sha)
      .map((surface) => `${surface.reviewer}:${surface.head_sha}`),
  );
}

function base(input: PostReviewConvergenceInput): Pick<
  PostReviewConvergenceVerdict,
  "repository_full_name" | "pr_number" | "branch" | "head_sha" | "warnings"
> {
  return {
    repository_full_name: input.repository_full_name,
    pr_number: input.pr_number,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    warnings: input.status_surface.warnings,
  };
}

function block(
  input: PostReviewConvergenceInput,
  action: Exclude<
    PostReviewConvergenceAction,
    | "admit_merge_window"
    | "route_to_review_repair"
    | "wait_for_live_review"
    | "route_to_external_embodiment"
    | "emit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): PostReviewConvergenceVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    approvals: [],
    change_requests: [],
    blockers,
    decisive_evidence: evidence,
    next_route: nextRoute,
  };
}

export function routePostReviewConvergence(input: PostReviewConvergenceInput): PostReviewConvergenceVerdict {
  const status = input.status_surface;
  const evidence = [
    `live head ${input.live_head_sha}`,
    `status surface ${status.surface_id}`,
    `status head ${status.head_sha}`,
    `intent ${input.requested_intent}`,
  ];

  if (input.candidate_branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`candidate branch ${input.candidate_branch} does not match active branch ${input.active_branch}`],
      "bind post-review convergence to the active PR branch before release",
      evidence,
    );
  }

  if (NON_PROGRESS_INTENTS.has(input.requested_intent)) {
    return block(
      input,
      "block_non_progress_intent",
      [`post-review convergence cannot be satisfied by ${input.requested_intent}`],
      "consume the live-head review and status surfaces as merge, repair, wait, embodiment, or exact blocker routing",
      evidence,
    );
  }

  if (input.requested_intent === "exact_external_blocker") {
    const blocker = input.exact_blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_missing_exact_blocker",
        ["post-review convergence exact blocker intent has no blocker text"],
        "name one exact external blocker or consume the live review/status surfaces",
        evidence,
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_exact_external_blocker",
      approvals: [],
      change_requests: [],
      blockers: [blocker],
      decisive_evidence: [...evidence, blocker],
      next_route: "remove the named external blocker before attempting post-review convergence again",
    };
  }

  if (status.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_status_surface",
      [`status surface ${status.surface_id} belongs to ${status.head_sha}, not ${input.live_head_sha}`],
      "read a status surface for the live PR head before consuming review state",
      evidence,
    );
  }

  if (!passing(status)) {
    return block(
      input,
      "block_live_status_not_passing",
      [
        ...status.blockers,
        ...(status.decisive_successes.length === 0 ? ["live status surface has no decisive success evidence"] : []),
        `status verdict ${status.verdict}`,
      ],
      "wait for or repair the live-head status surface before post-review convergence",
      evidence,
    );
  }

  const staleReviews = staleReviewHeads(input);
  if (staleReviews.length > 0 && liveReviews(input).length === 0) {
    return block(
      input,
      "block_stale_review_surface",
      staleReviews.map((review) => `review surface is not bound to live head: ${review}`),
      "discard stale review surfaces and wait for live-head review response",
      evidence,
    );
  }

  if (input.draft || !input.mergeable) {
    return block(
      input,
      "block_unready_pr",
      [...(input.draft ? ["PR is still draft"] : []), ...(!input.mergeable ? ["GitHub mergeability is not confirmed"] : [])],
      "make the PR non-draft and mergeable before consuming post-review convergence",
      evidence,
    );
  }

  const reviews = liveReviews(input);
  const approvals = normalize(reviews.filter((surface) => surface.state === "approved").map((surface) => surface.reviewer));
  const changeRequests = normalize(
    reviews.filter((surface) => surface.state === "changes_requested").map((surface) => surface.reviewer),
  );

  if (changeRequests.length > 0) {
    return {
      ...base(input),
      ok: true,
      action: "route_to_review_repair",
      approvals,
      change_requests: changeRequests,
      blockers: changeRequests.map((reviewer) => `live-head changes requested by ${reviewer}`),
      decisive_evidence: [...evidence, ...changeRequests.map((reviewer) => `changes requested by ${reviewer}`)],
      next_route: "repair the live-head review changes, then re-enter status/review convergence on the moved head",
    };
  }

  if (approvals.length >= Math.max(1, input.required_approval_count)) {
    return {
      ...base(input),
      ok: true,
      action: input.requested_intent === "external_platform_embodiment" ? "route_to_external_embodiment" : "admit_merge_window",
      approvals,
      change_requests: [],
      blockers: [],
      decisive_evidence: [
        ...evidence,
        ...status.decisive_successes,
        ...approvals.map((reviewer) => `approved by ${reviewer}`),
      ],
      next_route:
        input.requested_intent === "external_platform_embodiment"
          ? "continue with a non-repeated executable embodiment only if merge is intentionally deferred"
          : "compile merge command only while status, review, and mergeability still bind to this live head",
    };
  }

  return {
    ...base(input),
    ok: true,
    action: "wait_for_live_review",
    approvals,
    change_requests: [],
    blockers: ["required live-head review approval has not surfaced"],
    decisive_evidence: [...evidence, ...status.decisive_successes],
    next_route: "wait for live-head review approval, route review changes to repair, or emit an exact external blocker",
  };
}
