import { routeReviewWindowExpiration, type ReviewWindowExpirationVerdict } from "./review-window-expiration.js";
import { routeReviewWindowHandoff } from "./review-window-handoff-router.js";

const branch = "monday-platform-genesis-01";
const head = "review-window-live-head";

function expiration(overrides: Partial<ReviewWindowExpirationVerdict> = {}): ReviewWindowExpirationVerdict {
  const verdict = routeReviewWindowExpiration({
    receipt: {
      ok: true,
      repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
      pr_number: 2,
      branch,
      head_sha: head,
      requested_reviewers: ["reviewer-a"],
      requested_team_reviewers: [],
      requested_at: "2026-06-20T17:00:00.000Z",
      expires_at: "2026-06-20T17:30:00.000Z",
      blockers: [],
    },
    live_head_sha: head,
    observed_at: "2026-06-20T18:00:00.000Z",
    review_response_count: 0,
    status_surface: {
      head_sha: head,
      verdict: "passing_with_warnings",
      blocking_failures: [],
      pending_surfaces: [],
      non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
    },
  });

  return { ...verdict, ...overrides };
}

function expectAction(name: string, action: string, actual: string): void {
  if (actual !== action) {
    throw new Error(`${name} expected ${action}, got ${actual}`);
  }
}

const expired = routeReviewWindowHandoff({
  active_branch: branch,
  live_head_sha: head,
  requested_move: "exact_external_blocker",
  expiration: expiration(),
});
expectAction("expired review window", "emit_exact_external_blocker", expired.action);
if (expired.ok) throw new Error("expired review window should remain an external blocker");

const duplicateSummary = routeReviewWindowHandoff({
  active_branch: branch,
  live_head_sha: head,
  requested_move: "duplicate_status_summary",
  expiration: expiration(),
});
expectAction("duplicate summary", "block_non_progress_move", duplicateSummary.action);

const responseIntake = routeReviewWindowHandoff({
  active_branch: branch,
  live_head_sha: head,
  requested_move: "review_response_intake",
  expiration: expiration({
    ok: true,
    action: "route_to_review_response_intake",
    blockers: [],
    decisive_evidence: ["review responses surfaced: 1"],
  }),
});
expectAction("review response intake", "route_to_review_response_intake", responseIntake.action);
if (!responseIntake.ok) throw new Error("review response intake should be admitted");

const staleWindow = routeReviewWindowHandoff({
  active_branch: branch,
  live_head_sha: head,
  requested_move: "refresh_review_request",
  expiration: expiration({
    ok: false,
    action: "block_stale_review_window",
    head_sha: head,
    blockers: ["review request head old-head is not live head review-window-live-head"],
  }),
});
expectAction("stale review window", "route_to_fresh_review_request", staleWindow.action);
if (!staleWindow.ok) throw new Error("stale review window should route to a fresh live-head review request");

const openWindow = routeReviewWindowHandoff({
  active_branch: branch,
  live_head_sha: head,
  requested_move: "wait_for_review_window",
  expiration: expiration({
    ok: false,
    action: "wait_for_review_window",
    blockers: ["review window is still open and no live-head review response has surfaced"],
  }),
});
expectAction("open review window", "hold_review_window_open", openWindow.action);
if (openWindow.ok) throw new Error("open review window should not be terminal progress");

const mixedHead = routeReviewWindowHandoff({
  active_branch: branch,
  live_head_sha: head,
  requested_move: "exact_external_blocker",
  expiration: expiration({ head_sha: "stale-head" }),
});
expectAction("mixed head", "block_stale_head", mixedHead.action);

console.log(JSON.stringify({ expired, duplicateSummary, responseIntake, staleWindow, openWindow, mixedHead }, null, 2));
