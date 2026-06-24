export type ReviewMergeStatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "no_status_surface";

export type ReviewMergeState = "approved" | "commented" | "changes_requested" | "dismissed" | "pending";

export type ReviewMergeRequestedAction =
  | "merge"
  | "wait_for_review"
  | "review_repair"
  | "status_repair"
  | "duplicate_status_summary"
  | "review_request_receipt"
  | "internal_memory_guard";

export type ReviewMergeReleaseAction =
  | "enter_merge_command"
  | "wait_for_review"
  | "route_to_review_repair"
  | "route_to_status_repair"
  | "block_stale_surface"
  | "block_draft_or_unmergeable"
  | "block_non_progress";

export interface ReviewMergeSurface {
  reviewer: string;
  state: ReviewMergeState;
  head_sha: string;
  submitted_at?: string;
}

export interface ReviewMergeReleaseGateInput {
  repository_full_name: string;
  pr_number: number;
  branch: string;
  active_branch: string;
  live_head_sha: string;
  status_head_sha: string;
  status_verdict: ReviewMergeStatusVerdict;
  draft: boolean;
  mergeable: boolean | null;
  required_approval_count: number;
  review_surfaces: ReviewMergeSurface[];
  blocking_failures: string[];
  pending_surfaces: string[];
  non_blocking_warnings: string[];
  requested_action: ReviewMergeRequestedAction;
}

export interface ReviewMergeReleaseGateVerdict {
  ok: boolean;
  action: ReviewMergeReleaseAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  pending_reviewers: string[];
  warnings: string[];
  next_route: string;
}

const NON_PROGRESS_ACTIONS = new Set<ReviewMergeRequestedAction>([
  "duplicate_status_summary",
  "review_request_receipt",
  "internal_memory_guard",
]);

function base(input: ReviewMergeReleaseGateInput): Pick<ReviewMergeReleaseGateVerdict, "repository_full_name" | "pr_number" | "branch" | "head_sha" | "warnings"> {
  return {
    repository_full_name: input.repository_full_name,
    pr_number: input.pr_number,
    branch: input.branch,
    head_sha: input.live_head_sha,
    warnings: input.non_blocking_warnings,
  };
}

function block(
  input: ReviewMergeReleaseGateInput,
  action: Exclude<ReviewMergeReleaseAction, "enter_merge_command">,
  blockers: string[],
  nextRoute: string,
  pendingReviewers: string[] = [],
): ReviewMergeReleaseGateVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: [],
    blockers,
    pending_reviewers: pendingReviewers,
    next_route: nextRoute,
  };
}

function currentHeadReviews(input: ReviewMergeReleaseGateInput): ReviewMergeSurface[] {
  return input.review_surfaces.filter((review) => review.head_sha === input.live_head_sha);
}

function uniqueReviewers(reviews: ReviewMergeSurface[], state: ReviewMergeState): string[] {
  return [...new Set(reviews.filter((review) => review.state === state).map((review) => review.reviewer))];
}

function approvalShortfall(input: ReviewMergeReleaseGateInput, approvals: string[]): string[] {
  const missing = Math.max(0, input.required_approval_count - approvals.length);
  return Array.from({ length: missing }, (_, index) => `approval_required_${index + 1}`);
}

export function gateReviewMergeRelease(input: ReviewMergeReleaseGateInput): ReviewMergeReleaseGateVerdict {
  if (NON_PROGRESS_ACTIONS.has(input.requested_action)) {
    return block(
      input,
      "block_non_progress",
      [`requested action is not merge progress: ${input.requested_action}`],
      "choose merge, wait_for_review, review_repair, or status_repair against the live PR head",
    );
  }

  if (input.branch !== input.active_branch) {
    return block(
      input,
      "block_stale_surface",
      [`merge gate branch ${input.branch} does not match active branch ${input.active_branch}`],
      "bind merge release to the active PR branch before issuing a merge command",
    );
  }

  if (input.status_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_surface",
      [`status surface belongs to ${input.status_head_sha}, not live head ${input.live_head_sha}`],
      "obtain live-head status before routing merge release",
    );
  }

  if (input.draft) {
    return block(input, "block_draft_or_unmergeable", ["PR is draft"], "mark the PR ready before merge release");
  }

  if (input.status_verdict === "failing") {
    return block(
      input,
      "route_to_status_repair",
      input.blocking_failures.length > 0 ? input.blocking_failures : ["live-head status is failing"],
      "repair live-head status failures before merge release",
    );
  }

  if (input.status_verdict === "pending") {
    return block(
      input,
      "route_to_status_repair",
      input.pending_surfaces.length > 0 ? input.pending_surfaces : ["live-head status is pending"],
      "wait for live-head status before merge release",
    );
  }

  if (input.status_verdict === "no_status_surface") {
    return block(input, "route_to_status_repair", ["no live-head status surface"], "read live-head status before merge release");
  }

  const reviews = currentHeadReviews(input);
  const changesRequested = uniqueReviewers(reviews, "changes_requested");
  if (changesRequested.length > 0) {
    return block(
      input,
      "route_to_review_repair",
      changesRequested.map((reviewer) => `review changes requested by ${reviewer}`),
      "repair live-head review requests before merge release",
    );
  }

  const approvals = uniqueReviewers(reviews, "approved");
  const pendingReviewers = approvalShortfall(input, approvals);
  if (pendingReviewers.length > 0) {
    return block(
      input,
      "wait_for_review",
      [`${pendingReviewers.length} live-head approval(s) still required`],
      "wait for required live-head review approval before merge release",
      pendingReviewers,
    );
  }

  if (input.mergeable !== true) {
    return block(
      input,
      "block_draft_or_unmergeable",
      [input.mergeable === null ? "PR mergeability is unknown" : "PR is not mergeable"],
      "refresh mergeability or repair merge conflicts before issuing merge command",
    );
  }

  if (input.requested_action !== "merge") {
    return block(
      input,
      "block_non_progress",
      [`requested action ${input.requested_action} cannot release merge after gates pass`],
      "issue the merge command only after status, review, and mergeability gates pass",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "enter_merge_command",
    decisive_evidence: [
      `live head ${input.live_head_sha}`,
      `status ${input.status_verdict}`,
      `approvals ${approvals.length}/${input.required_approval_count}`,
      "mergeable true",
      ...approvals.map((reviewer) => `approved by ${reviewer}`),
    ],
    blockers: [],
    pending_reviewers: [],
    next_route: "issue one live-head-bound merge command; do not replace it with another status summary or review-request receipt",
  };
}
