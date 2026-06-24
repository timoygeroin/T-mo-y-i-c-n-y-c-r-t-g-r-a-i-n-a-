export type ReviewResponseState = "approved" | "changes_requested" | "commented" | "dismissed" | "pending" | "missing";

export type ReviewResponseRequestedAction =
  | "merge"
  | "current_head_repair"
  | "continue_embodiment"
  | "request_review"
  | "duplicate_comment"
  | "metadata_reread";

export type ReviewResponseRouterAction =
  | "admit_merge_after_approval"
  | "route_requested_changes_to_repair"
  | "route_comments_to_embodiment"
  | "route_to_review_request"
  | "block_stale_review_surface"
  | "block_missing_review_surface"
  | "block_non_progress_action"
  | "block_unmergeable_head";

export interface ReviewResponseSurface {
  surface_id: string;
  head_sha: string;
  reviewer: string;
  state: ReviewResponseState;
  submitted_at?: string;
  body_excerpt?: string;
}

export interface ReviewResponseRepairCandidate {
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  failure_signature?: string;
}

export interface ReviewResponseRouterInput {
  repository_full_name: string;
  pr_number: number;
  branch: string;
  active_branch: string;
  live_head_sha: string;
  mergeable: boolean;
  status_verdict: "passing" | "passing_with_warnings" | "pending" | "failing" | "unknown";
  requested_action: ReviewResponseRequestedAction;
  review_surfaces: ReviewResponseSurface[];
  repair_candidate?: ReviewResponseRepairCandidate;
}

export interface ReviewResponseRouterVerdict {
  ok: boolean;
  action: ReviewResponseRouterAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  accepted_review_surface_ids: string[];
  stale_review_surface_ids: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_ACTIONS = new Set<ReviewResponseRequestedAction>(["duplicate_comment", "metadata_reread"]);

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function proofOnlyPath(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function base(input: ReviewResponseRouterInput): Pick<
  ReviewResponseRouterVerdict,
  "repository_full_name" | "pr_number" | "branch" | "head_sha"
> {
  return {
    repository_full_name: input.repository_full_name,
    pr_number: input.pr_number,
    branch: input.branch,
    head_sha: input.live_head_sha,
  };
}

function acceptedReviews(input: ReviewResponseRouterInput): ReviewResponseSurface[] {
  return input.review_surfaces.filter((surface) => surface.head_sha === input.live_head_sha);
}

function staleReviews(input: ReviewResponseRouterInput): ReviewResponseSurface[] {
  return input.review_surfaces.filter((surface) => surface.head_sha !== input.live_head_sha);
}

function block(
  input: ReviewResponseRouterInput,
  action: Exclude<
    ReviewResponseRouterAction,
    | "admit_merge_after_approval"
    | "route_requested_changes_to_repair"
    | "route_comments_to_embodiment"
    | "route_to_review_request"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ReviewResponseRouterVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    accepted_review_surface_ids: acceptedReviews(input).map((surface) => surface.surface_id),
    stale_review_surface_ids: staleReviews(input).map((surface) => surface.surface_id),
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function repairCandidateBlockers(candidate: ReviewResponseRepairCandidate | undefined): string[] {
  if (!candidate) return ["requested-changes review has no repair candidate"];

  const executableChanges = candidate.changed_files.filter(executablePlatformPath);
  const behaviorChanges = executableChanges.filter((path) => !proofOnlyPath(path));
  const blockers: string[] = [];

  if (executableChanges.length === 0) blockers.push("review repair changes no executable platform file");
  if (executableChanges.length > 0 && behaviorChanges.length === 0) {
    blockers.push("review repair is proof-only and has no behavior file");
  }
  if (candidate.executable_artifacts.length === 0) blockers.push("review repair has no executable artifact evidence");
  if (candidate.routing_artifacts.length === 0) blockers.push("review repair has no future-routing artifact evidence");
  if (candidate.proof_artifacts.length === 0) blockers.push("review repair has no proof artifact evidence");
  if (!candidate.failure_signature?.trim()) blockers.push("review repair has no requested-change failure signature");

  return blockers;
}

function reviewEvidence(surface: ReviewResponseSurface): string[] {
  return [
    surface.surface_id,
    surface.reviewer,
    surface.state,
    ...(surface.submitted_at ? [surface.submitted_at] : []),
    ...(surface.body_excerpt ? [surface.body_excerpt] : []),
  ];
}

export function routeReviewResponse(input: ReviewResponseRouterInput): ReviewResponseRouterVerdict {
  if (input.branch !== input.active_branch) {
    return block(
      input,
      "block_stale_review_surface",
      [`review response branch ${input.branch} does not match active branch ${input.active_branch}`],
      "bind review response routing to the active PR branch before release",
    );
  }

  if (NON_PROGRESS_ACTIONS.has(input.requested_action)) {
    return block(
      input,
      "block_non_progress_action",
      [`review response requested non-progress action: ${input.requested_action}`],
      "route from a live review surface to merge, repair, embodiment, or a real review request",
    );
  }

  const liveReviews = acceptedReviews(input);
  if (liveReviews.length === 0) {
    const stale = staleReviews(input);
    if (stale.length > 0) {
      return block(
        input,
        "block_stale_review_surface",
        stale.map((surface) => `review surface ${surface.surface_id} belongs to ${surface.head_sha}, not ${input.live_head_sha}`),
        "discard stale review responses and wait for or request review on the live PR head",
        stale.flatMap(reviewEvidence),
      );
    }

    if (input.requested_action === "request_review") {
      return {
        ...base(input),
        ok: true,
        action: "route_to_review_request",
        accepted_review_surface_ids: [],
        stale_review_surface_ids: [],
        decisive_evidence: [`no live review surface exists for ${input.live_head_sha}`],
        blockers: [],
        next_route: "compile a guarded GitHub review request command for the live PR head",
      };
    }

    return block(
      input,
      "block_missing_review_surface",
      [`no live review response exists for ${input.live_head_sha}`],
      "request review on the live PR head before merge, repair, or review-response routing",
    );
  }

  const requestedChanges = liveReviews.filter((surface) => surface.state === "changes_requested");
  if (requestedChanges.length > 0) {
    const blockers = repairCandidateBlockers(input.repair_candidate);
    if (blockers.length > 0) {
      return block(
        input,
        "block_missing_review_surface",
        blockers,
        "supply a behavior-bearing current-head repair candidate bound to the requested changes review",
        requestedChanges.flatMap(reviewEvidence),
      );
    }

    const candidate = input.repair_candidate;
    return {
      ...base(input),
      ok: true,
      action: "route_requested_changes_to_repair",
      accepted_review_surface_ids: liveReviews.map((surface) => surface.surface_id),
      stale_review_surface_ids: staleReviews(input).map((surface) => surface.surface_id),
      decisive_evidence: [
        ...requestedChanges.flatMap(reviewEvidence),
        candidate?.failure_signature ?? "requested changes",
        ...(candidate?.changed_files.filter(executablePlatformPath) ?? []),
        ...(candidate?.executable_artifacts ?? []),
        ...(candidate?.routing_artifacts ?? []),
        ...(candidate?.proof_artifacts ?? []),
      ],
      blockers: [],
      next_route: "repair the requested changes on the live head, then require status and review response readback for the moved head",
    };
  }

  const approvals = liveReviews.filter((surface) => surface.state === "approved");
  if (approvals.length > 0 && input.requested_action === "merge") {
    if (!input.mergeable) {
      return block(
        input,
        "block_unmergeable_head",
        [`GitHub mergeability is not confirmed for ${input.live_head_sha}`],
        "resolve mergeability before merging an approved live head",
        approvals.flatMap(reviewEvidence),
      );
    }
    if (input.status_verdict !== "passing" && input.status_verdict !== "passing_with_warnings") {
      return block(
        input,
        "block_unmergeable_head",
        [`live-head status is ${input.status_verdict}, not passing`],
        "obtain passing live-head status before merging an approved PR head",
        approvals.flatMap(reviewEvidence),
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_merge_after_approval",
      accepted_review_surface_ids: liveReviews.map((surface) => surface.surface_id),
      stale_review_surface_ids: staleReviews(input).map((surface) => surface.surface_id),
      decisive_evidence: approvals.flatMap(reviewEvidence),
      blockers: [],
      next_route: "merge only through the authorized GitHub merge boundary while the head guard still matches",
    };
  }

  return {
    ...base(input),
    ok: true,
    action: "route_comments_to_embodiment",
    accepted_review_surface_ids: liveReviews.map((surface) => surface.surface_id),
    stale_review_surface_ids: staleReviews(input).map((surface) => surface.surface_id),
    decisive_evidence: liveReviews.flatMap(reviewEvidence),
    blockers: [],
    next_route: "turn live review comments into the next non-repeated executable embodiment or exact blocker",
  };
}
