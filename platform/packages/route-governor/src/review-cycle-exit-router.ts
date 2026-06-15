import type { ContinuationStatusReceiptSurface } from "./index.js";
import type { ReviewResponseIntakeVerdict } from "./review-response-intake.js";

export type ReviewCycleMergeability = true | false | null | "unknown";

export type ReviewCycleExitAction =
  | "route_to_merge_gate"
  | "route_to_review_repair"
  | "wait_for_review_response"
  | "read_live_head_status"
  | "wait_for_checks"
  | "repair_status_failure"
  | "emit_exact_external_blocker"
  | "block_stale_review_head"
  | "block_unmergeable_pr";

export interface ReviewCycleExitInput {
  review: ReviewResponseIntakeVerdict;
  live_head_sha: string;
  draft: boolean;
  mergeable: ReviewCycleMergeability;
  status_surface?: ContinuationStatusReceiptSurface;
  exact_external_blocker?: string;
}

export interface ReviewCycleExitVerdict {
  ok: boolean;
  action: ReviewCycleExitAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

function base(input: ReviewCycleExitInput): Pick<
  ReviewCycleExitVerdict,
  "repository_full_name" | "pr_number" | "branch" | "head_sha" | "warnings"
> {
  return {
    repository_full_name: input.review.repository_full_name,
    pr_number: input.review.pr_number,
    branch: input.review.branch,
    head_sha: input.live_head_sha,
    warnings: input.status_surface?.non_blocking_warnings ?? [],
  };
}

function reviewEvidence(input: ReviewCycleExitInput): string[] {
  return [
    `review action ${input.review.action}`,
    `review head ${input.review.head_sha}`,
    `live head ${input.live_head_sha}`,
    ...input.review.decisive_evidence,
  ];
}

function block(
  input: ReviewCycleExitInput,
  action: Exclude<ReviewCycleExitAction, "route_to_merge_gate">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ReviewCycleExitVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function statusBlockers(status: ContinuationStatusReceiptSurface): string[] {
  if (status.blocking_failures.length > 0) return status.blocking_failures;
  if (status.pending_surfaces.length > 0) return status.pending_surfaces;
  if (status.decisive_successes.length === 0) return ["live-head status surface has no decisive success evidence"];
  return ["live-head status surface is not passing"];
}

export function routeReviewCycleExit(input: ReviewCycleExitInput): ReviewCycleExitVerdict {
  const evidence = reviewEvidence(input);

  if (input.review.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_review_head",
      [`review response head ${input.review.head_sha} is not live head ${input.live_head_sha}`],
      "discard stale review response surfaces and re-enter from the live PR head",
      evidence,
    );
  }

  const exactBlocker = input.exact_external_blocker?.trim();
  if (exactBlocker) {
    return block(
      input,
      "emit_exact_external_blocker",
      [exactBlocker],
      "remove the named external blocker before merge-gate routing",
      evidence,
    );
  }

  if (input.review.action === "route_to_review_repair" || input.review.change_requests.length > 0) {
    return block(
      input,
      "route_to_review_repair",
      input.review.blockers.length > 0 ? input.review.blockers : input.review.change_requests.map((reviewer) => `review changes requested by ${reviewer}`),
      "repair live-head review changes before requesting merge gate",
      evidence,
    );
  }

  if (input.review.action === "wait_for_review_response") {
    return block(
      input,
      "wait_for_review_response",
      input.review.blockers.length > 0 ? input.review.blockers : ["required live-head review response has not surfaced"],
      "wait for the live-head review response or surface one exact review blocker",
      evidence,
    );
  }

  if (!input.review.ok || input.review.action !== "route_to_merge_gate") {
    return block(
      input,
      "emit_exact_external_blocker",
      input.review.blockers.length > 0 ? input.review.blockers : [`review response action cannot enter merge gate: ${input.review.action}`],
      "resolve the review response intake blocker before merge-gate routing",
      evidence,
    );
  }

  if (!input.status_surface) {
    return block(
      input,
      "read_live_head_status",
      [`no live-head status surface is attached for ${input.live_head_sha}`],
      "read current-head status before merge-gate routing",
      evidence,
    );
  }

  if (!input.status_surface.ok) {
    const blockers = statusBlockers(input.status_surface);
    const hasPending = input.status_surface.pending_surfaces.length > 0 || input.status_surface.verdict === "pending";

    return block(
      input,
      hasPending ? "wait_for_checks" : "repair_status_failure",
      blockers,
      hasPending ? "wait for live-head checks to complete" : "repair the concrete live-head status failure",
      [...evidence, ...blockers],
    );
  }

  if (input.draft) {
    return block(
      input,
      "block_unmergeable_pr",
      ["PR is still draft"],
      "mark the PR ready before merge-gate routing",
      evidence,
    );
  }

  if (input.mergeable !== true) {
    return block(
      input,
      "block_unmergeable_pr",
      [`GitHub mergeability is not confirmed for head ${input.live_head_sha}`],
      "resolve mergeability or rerun the live PR readback after GitHub computes it",
      evidence,
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "route_to_merge_gate",
    decisive_evidence: [
      ...evidence,
      ...input.review.approvals.map((reviewer) => `approved by ${reviewer}`),
      ...input.status_surface.decisive_successes,
    ],
    blockers: [],
    next_route: "enter merge gate through the authorized GitHub boundary; do not add another embodiment unless review, status, or mergeability changes",
  };
}
