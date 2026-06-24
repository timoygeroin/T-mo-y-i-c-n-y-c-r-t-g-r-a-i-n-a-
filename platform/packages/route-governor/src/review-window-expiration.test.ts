import assert from "node:assert/strict";
import test from "node:test";
import {
  routeReviewWindowExpiration,
  type ReviewWindowExpirationInput,
  type ReviewWindowRequestReceipt,
} from "./review-window-expiration.js";

const head = "0c5c172738beff2e6b6cf6a667d55df9888314cd";

function receipt(overrides: Partial<ReviewWindowRequestReceipt> = {}): ReviewWindowRequestReceipt {
  return {
    ok: true,
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch: "monday-platform-genesis-01",
    head_sha: head,
    requested_reviewers: ["reviewer-a"],
    requested_team_reviewers: [],
    requested_at: "2026-06-20T17:00:00.000Z",
    expires_at: "2026-06-20T21:00:00.000Z",
    blockers: [],
    ...overrides,
  };
}

function input(overrides: Partial<ReviewWindowExpirationInput> = {}): ReviewWindowExpirationInput {
  return {
    receipt: receipt(),
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
    ...overrides,
  };
}

test("waits while a live-head review window is still open", () => {
  const verdict = routeReviewWindowExpiration(input());

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "wait_for_review_window");
  assert.deepEqual(verdict.pending_review_targets, ["reviewer-a"]);
  assert.deepEqual(verdict.warnings, ["Node.js 20 Actions deprecation notice"]);
});

test("routes surfaced review responses to review-response intake", () => {
  const verdict = routeReviewWindowExpiration(input({ review_response_count: 1 }));

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "route_to_review_response_intake");
  assert.match(verdict.next_route, /review responses/);
});

test("emits an exact blocker when the review window expires without response", () => {
  const verdict = routeReviewWindowExpiration(input({ observed_at: "2026-06-20T21:00:00.000Z" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "emit_review_window_blocker");
  assert.deepEqual(verdict.blockers, ["review window expired without live-head response from: reviewer-a"]);
});

test("blocks stale review request receipts", () => {
  const verdict = routeReviewWindowExpiration(
    input({
      receipt: receipt({ head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_review_window");
  assert.deepEqual(verdict.blockers, [
    `review request head b38ea247602ae8ebba80c4120ad03b41b26bd841 is not live head ${head}`,
  ]);
});

test("blocks review-window routing while live-head status is unstable", () => {
  const verdict = routeReviewWindowExpiration(
    input({
      status_surface: {
        head_sha: head,
        verdict: "failing",
        blocking_failures: ["Route Governor Proof / proof examples failed"],
        pending_surfaces: [],
        non_blocking_warnings: [],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_unstable_head_status");
  assert.deepEqual(verdict.blockers, ["Route Governor Proof / proof examples failed"]);
});

test("blocks unreceipted review windows", () => {
  const verdict = routeReviewWindowExpiration(
    input({
      receipt: receipt({ ok: false, blockers: ["GitHub review request did not complete"] }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_unrequested_review_window");
  assert.deepEqual(verdict.blockers, ["GitHub review request did not complete"]);
});
