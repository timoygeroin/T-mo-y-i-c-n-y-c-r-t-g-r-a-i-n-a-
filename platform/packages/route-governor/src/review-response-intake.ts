import type { ReviewRequestResultReceipt } from "./review-request-result-receipt.js";

export type ReviewResponseState = "approved" | "changes_requested" | "commented" | "pending" | "dismissed" | "missing";

export type ReviewResponseIntakeAction =
  | "route_to_merge_gate"
  | "route_to_review_repair"
  | "wait_for_review_response"
  | "emit_review_response_blocker"
  | "block_stale_review_receipt"
  | "block_unreceipted_review_request";

export interface ReviewResponseSurface {
  reviewer: string;
  state: ReviewResponseState;
  head_sha: string;
  submitted_at?: string;
  body?: string;
}

export interface ReviewResponseIntakeInput {
  receipt: ReviewRequestResultReceipt;
  live_head_sha: string;
  review_surfaces: ReviewResponseSurface[];
  required_approval_count: number;
  known_external_blocker?: string;
}

export interface ReviewResponseIntakeVerdict {
  ok: boolean;
  action: ReviewResponseIntakeAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  approvals: string[];
  change_requests: string[];
  pending_reviewers: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function normalize(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function base(input: ReviewResponseIntakeInput): Pick<
  ReviewResponseIntakeVerdict,
  "repository_full_name" | "pr_number" | "branch" | "head_sha"
> {
  return {
    repository_full_name: input.receipt.repository_full_name,
    pr_number: input.receipt.pr_number,
    branch: input.receipt.branch,
    head_sha: input.live_head_sha,
  };
}

function requestedTargets(receipt: ReviewRequestResultReceipt): string[] {
  return normalize([...receipt.reviewers, ...receipt.team_reviewers]);
}

function latestLiveSurfaces(input: ReviewResponseIntakeInput): ReviewResponseSurface[] {
  const byReviewer = new Map<string, ReviewResponseSurface>();

  for (const surface of input.review_surfaces) {
    if (surface.head_sha !== input.live_head_sha) continue;
    byReviewer.set(surface.reviewer.trim(), surface);
  }

  return [...byReviewer.values()].sort((left, right) => left.reviewer.localeCompare(right.reviewer));
}

function block(
  input: ReviewResponseIntakeInput,
  action: Exclude<ReviewResponseIntakeAction, "route_to_merge_gate" | "route_to_review_repair" | "wait_for_review_response">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ReviewResponseIntakeVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    approvals: [],
    change_requests: [],
    pending_reviewers: requestedTargets(input.receipt),
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

export function intakeReviewResponses(input: ReviewResponseIntakeInput): ReviewResponseIntakeVerdict {
  const receipt = input.receipt;
  const requested = requestedTargets(receipt);
  const evidence = [
    `receipt ${receipt.receipt_id ?? "<none>"}`,
    `receipt head ${receipt.head_sha}`,
    `live head ${input.live_head_sha}`,
  ];

  if (!receipt.ok || receipt.action !== "compile_review_request_result_receipt") {
    return block(
      input,
      "block_unreceipted_review_request",
      [...receipt.blockers, `review request receipt action is ${receipt.action}`],
      "obtain a successful GitHub review-request result receipt before interpreting review responses",
      evidence,
    );
  }

  if (receipt.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_review_receipt",
      [`review request receipt head ${receipt.head_sha} is not live head ${input.live_head_sha}`],
      "discard stale review response surfaces and re-enter from the live PR head",
      evidence,
    );
  }

  const exactBlocker = input.known_external_blocker?.trim();
  if (exactBlocker) {
    return block(
      input,
      "emit_review_response_blocker",
      [exactBlocker],
      "remove the named external review-response blocker before merge or repair routing",
      evidence,
    );
  }

  const liveSurfaces = latestLiveSurfaces(input);
  const approvals = normalize(liveSurfaces.filter((surface) => surface.state === "approved").map((surface) => surface.reviewer));
  const changeRequests = normalize(
    liveSurfaces.filter((surface) => surface.state === "changes_requested").map((surface) => surface.reviewer),
  );
  const respondingReviewers = new Set(liveSurfaces.map((surface) => surface.reviewer.toLowerCase()));
  const pendingReviewers = requested.filter((target) => !respondingReviewers.has(target.toLowerCase()));

  if (changeRequests.length > 0) {
    return {
      ...base(input),
      ok: false,
      action: "route_to_review_repair",
      approvals,
      change_requests: changeRequests,
      pending_reviewers: pendingReviewers,
      decisive_evidence: [
        ...evidence,
        ...changeRequests.map((reviewer) => `changes requested by ${reviewer}`),
      ],
      blockers: changeRequests.map((reviewer) => `review changes requested by ${reviewer}`),
      next_route: "repair the live-head review changes before requesting merge readiness",
    };
  }

  if (approvals.length >= Math.max(1, input.required_approval_count)) {
    return {
      ...base(input),
      ok: true,
      action: "route_to_merge_gate",
      approvals,
      change_requests: [],
      pending_reviewers: pendingReviewers,
      decisive_evidence: [...evidence, ...approvals.map((reviewer) => `approved by ${reviewer}`)],
      blockers: [],
      next_route: "enter merge gate only after live-head status and mergeability are still current",
    };
  }

  return {
    ...base(input),
    ok: false,
    action: "wait_for_review_response",
    approvals,
    change_requests: [],
    pending_reviewers: pendingReviewers.length > 0 ? pendingReviewers : requested,
    decisive_evidence: evidence,
    blockers: ["required review approval has not surfaced on the live head"],
    next_route: "wait for live-head review response or emit a precise external review blocker if one appears",
  };
}
