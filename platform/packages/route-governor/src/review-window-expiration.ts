export type ReviewWindowStatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "no_status_surface";

export type ReviewWindowAction =
  | "route_to_review_response_intake"
  | "wait_for_review_window"
  | "emit_review_window_blocker"
  | "block_stale_review_window"
  | "block_unstable_head_status"
  | "block_unrequested_review_window";

export interface ReviewWindowRequestReceipt {
  ok: boolean;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  requested_reviewers: string[];
  requested_team_reviewers: string[];
  requested_at: string;
  expires_at: string;
  blockers: string[];
}

export interface ReviewWindowStatusSurface {
  head_sha: string;
  verdict: ReviewWindowStatusVerdict;
  blocking_failures: string[];
  pending_surfaces: string[];
  non_blocking_warnings: string[];
}

export interface ReviewWindowExpirationInput {
  receipt: ReviewWindowRequestReceipt;
  live_head_sha: string;
  observed_at: string;
  review_response_count: number;
  status_surface: ReviewWindowStatusSurface;
  known_external_blocker?: string;
}

export interface ReviewWindowExpirationVerdict {
  ok: boolean;
  action: ReviewWindowAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  pending_review_targets: string[];
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

function targets(receipt: ReviewWindowRequestReceipt): string[] {
  return [...new Set([...receipt.requested_reviewers, ...receipt.requested_team_reviewers].map((target) => target.trim()).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right),
  );
}

function timeOf(label: string, value: string): number {
  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    throw new Error(`${label} is not a valid timestamp: ${value}`);
  }
  return time;
}

function base(input: ReviewWindowExpirationInput): Pick<
  ReviewWindowExpirationVerdict,
  "repository_full_name" | "pr_number" | "branch" | "head_sha" | "pending_review_targets" | "warnings"
> {
  return {
    repository_full_name: input.receipt.repository_full_name,
    pr_number: input.receipt.pr_number,
    branch: input.receipt.branch,
    head_sha: input.live_head_sha,
    pending_review_targets: targets(input.receipt),
    warnings: input.status_surface.non_blocking_warnings,
  };
}

function block(
  input: ReviewWindowExpirationInput,
  action: Exclude<ReviewWindowAction, "route_to_review_response_intake" | "wait_for_review_window">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ReviewWindowExpirationVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

export function routeReviewWindowExpiration(input: ReviewWindowExpirationInput): ReviewWindowExpirationVerdict {
  const receipt = input.receipt;
  const pendingTargets = targets(receipt);
  const evidence = [
    `review request head ${receipt.head_sha}`,
    `live head ${input.live_head_sha}`,
    `review window ${receipt.requested_at}..${receipt.expires_at}`,
  ];

  if (!receipt.ok) {
    return block(
      input,
      "block_unrequested_review_window",
      receipt.blockers.length > 0 ? receipt.blockers : ["review request receipt is not successful"],
      "obtain a successful review request receipt before opening a review window",
      evidence,
    );
  }

  if (pendingTargets.length === 0) {
    return block(
      input,
      "block_unrequested_review_window",
      ["review window has no requested reviewers or teams"],
      "request a real reviewer or team before waiting on review response",
      evidence,
    );
  }

  if (receipt.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_review_window",
      [`review request head ${receipt.head_sha} is not live head ${input.live_head_sha}`],
      "discard the stale review window and request review against the live head",
      evidence,
    );
  }

  if (input.status_surface.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_unstable_head_status",
      [`status surface head ${input.status_surface.head_sha} is not live head ${input.live_head_sha}`],
      "bind status to the live head before routing review-window expiration",
      evidence,
    );
  }

  if (input.status_surface.verdict === "failing") {
    return block(
      input,
      "block_unstable_head_status",
      input.status_surface.blocking_failures.length > 0
        ? input.status_surface.blocking_failures
        : ["live-head status is failing"],
      "repair live-head checks before waiting on review response",
      evidence,
    );
  }

  if (input.status_surface.verdict === "pending") {
    return block(
      input,
      "block_unstable_head_status",
      input.status_surface.pending_surfaces.length > 0 ? input.status_surface.pending_surfaces : ["live-head status is pending"],
      "wait for live-head checks before starting the review response clock",
      evidence,
    );
  }

  if (input.status_surface.verdict === "no_status_surface") {
    return block(
      input,
      "block_unstable_head_status",
      ["review window has no live-head status surface"],
      "obtain a live-head status surface before starting the review response clock",
      evidence,
    );
  }

  const exactBlocker = input.known_external_blocker?.trim();
  if (exactBlocker) {
    return block(
      input,
      "emit_review_window_blocker",
      [exactBlocker],
      "remove the named external review-window blocker before merge or review-response routing",
      evidence,
    );
  }

  if (input.review_response_count > 0) {
    return {
      ...base(input),
      ok: true,
      action: "route_to_review_response_intake",
      pending_review_targets: pendingTargets,
      decisive_evidence: [...evidence, `review responses surfaced: ${input.review_response_count}`],
      blockers: [],
      next_route: "compile live-head review responses before merge gating",
    };
  }

  const observedAt = timeOf("observed_at", input.observed_at);
  const expiresAt = timeOf("expires_at", receipt.expires_at);

  if (observedAt >= expiresAt) {
    return block(
      input,
      "emit_review_window_blocker",
      [`review window expired without live-head response from: ${pendingTargets.join(", ")}`],
      "refresh or escalate the review request before merge gating",
      evidence,
    );
  }

  return {
    ...base(input),
    ok: false,
    action: "wait_for_review_window",
    pending_review_targets: pendingTargets,
    decisive_evidence: [...evidence, `review window still open at ${input.observed_at}`],
    blockers: ["review window is still open and no live-head review response has surfaced"],
    next_route: "wait until a review response surfaces or the review window expires",
  };
}
