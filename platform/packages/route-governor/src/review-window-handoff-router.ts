import type { ReviewWindowExpirationVerdict } from "./review-window-expiration.js";

export type ReviewWindowHandoffRequestedMove =
  | "review_response_intake"
  | "refresh_review_request"
  | "exact_external_blocker"
  | "wait_for_review_window"
  | "duplicate_comment"
  | "metadata_reread"
  | "duplicate_status_summary";

export type ReviewWindowHandoffAction =
  | "route_to_review_response_intake"
  | "route_to_fresh_review_request"
  | "emit_exact_external_blocker"
  | "hold_review_window_open"
  | "block_non_progress_move"
  | "block_stale_head"
  | "block_missing_blocker";

export interface ReviewWindowHandoffInput {
  active_branch: string;
  live_head_sha: string;
  requested_move: ReviewWindowHandoffRequestedMove;
  expiration: ReviewWindowExpirationVerdict;
}

export interface ReviewWindowHandoffVerdict {
  ok: boolean;
  action: ReviewWindowHandoffAction;
  branch: string;
  head_sha: string;
  pending_review_targets: string[];
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

const NON_PROGRESS_MOVES = new Set<ReviewWindowHandoffRequestedMove>([
  "duplicate_comment",
  "metadata_reread",
  "duplicate_status_summary",
]);

function base(input: ReviewWindowHandoffInput): Pick<
  ReviewWindowHandoffVerdict,
  "branch" | "head_sha" | "pending_review_targets" | "warnings"
> {
  return {
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    pending_review_targets: input.expiration.pending_review_targets,
    warnings: input.expiration.warnings,
  };
}

function block(
  input: ReviewWindowHandoffInput,
  action: Exclude<
    ReviewWindowHandoffAction,
    | "route_to_review_response_intake"
    | "route_to_fresh_review_request"
    | "emit_exact_external_blocker"
    | "hold_review_window_open"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ReviewWindowHandoffVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function expirationEvidence(input: ReviewWindowHandoffInput): string[] {
  return [
    `expiration action ${input.expiration.action}`,
    `expiration head ${input.expiration.head_sha}`,
    ...input.expiration.decisive_evidence,
  ];
}

export function routeReviewWindowHandoff(input: ReviewWindowHandoffInput): ReviewWindowHandoffVerdict {
  const evidence = expirationEvidence(input);

  if (input.expiration.branch !== input.active_branch || input.expiration.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_head",
      [
        `review-window expiration belongs to ${input.expiration.branch}@${input.expiration.head_sha}, not ${input.active_branch}@${input.live_head_sha}`,
      ],
      "rebuild the review-window expiration verdict from the live PR head before handoff routing",
      evidence,
    );
  }

  if (NON_PROGRESS_MOVES.has(input.requested_move)) {
    return block(
      input,
      "block_non_progress_move",
      [`${input.requested_move} cannot consume review-window handoff authority as progress`],
      "choose review response intake, fresh review request, wait, or one exact external blocker",
      evidence,
    );
  }

  if (input.expiration.action === "route_to_review_response_intake") {
    if (input.requested_move !== "review_response_intake") {
      return block(
        input,
        "block_non_progress_move",
        [`${input.requested_move} bypasses surfaced live-head review responses`],
        "route surfaced review responses into review-response intake before merge or another embodiment",
        evidence,
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "route_to_review_response_intake",
      decisive_evidence: evidence,
      blockers: [],
      next_route: "compile the live-head review response delta before merge gating",
    };
  }

  if (input.expiration.action === "wait_for_review_window") {
    if (input.requested_move !== "wait_for_review_window") {
      return block(
        input,
        "block_non_progress_move",
        [`${input.requested_move} cannot bypass an open review window`],
        "wait until the review window expires or review feedback appears",
        evidence,
      );
    }

    return {
      ...base(input),
      ok: false,
      action: "hold_review_window_open",
      decisive_evidence: evidence,
      blockers: input.expiration.blockers,
      next_route: "wait for live-head review feedback or the review-window expiration time",
    };
  }

  if (input.expiration.action === "block_stale_review_window") {
    if (input.requested_move !== "refresh_review_request") {
      return block(
        input,
        "block_stale_head",
        input.expiration.blockers,
        "discard stale review-window authority and request review against the live head",
        evidence,
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "route_to_fresh_review_request",
      decisive_evidence: evidence,
      blockers: [],
      next_route: "issue exactly one fresh review request command against the live head",
    };
  }

  if (input.requested_move !== "exact_external_blocker") {
    return block(
      input,
      "block_missing_blocker",
      input.expiration.blockers.length > 0 ? input.expiration.blockers : ["review-window expiration produced no executable handoff route"],
      "emit the exact review-window blocker instead of converting it into duplicate commentary or status summary",
      evidence,
    );
  }

  return {
    ...base(input),
    ok: false,
    action: "emit_exact_external_blocker",
    decisive_evidence: evidence,
    blockers: input.expiration.blockers,
    next_route: "remove the named review-window blocker before merge gating or another final-review handoff",
  };
}
