import { routeReviewWindowExpiration } from "./review-window-expiration.js";

const head = "0c5c172738beff2e6b6cf6a667d55df9888314cd";

const verdict = routeReviewWindowExpiration({
  receipt: {
    ok: true,
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch: "monday-platform-genesis-01",
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

if (verdict.action !== "emit_review_window_blocker") {
  throw new Error(`expected expired review window blocker, got ${verdict.action}`);
}

console.log(JSON.stringify(verdict, null, 2));
