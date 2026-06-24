import assert from "node:assert/strict";
import { test } from "node:test";

import {
  routeReviewWaitExitPolicy,
  type ReviewWaitExitPolicyInput,
  type ReviewWaitExitSurface,
} from "./review-wait-exit-policy.js";

const branch = "monday-platform-genesis-01";
const liveHead = "b47dc1389cdb0d0f4b4ab918c806f349b07f3a49";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function surface(overrides: Partial<ReviewWaitExitSurface> = {}): ReviewWaitExitSurface {
  return {
    exit_id: "review-wait-exit-live-head",
    branch,
    head_sha: liveHead,
    pr_open: true,
    draft: false,
    mergeable: true,
    status_verdict: "passing_with_warnings",
    feedback_kind: "approved",
    feedback_ids: ["review-approval-1"],
    final_review_surface_ids: [
      "final-review-authority-bundle",
      "review-request-command",
      "review-request-result-receipt",
    ],
    ...overrides,
  };
}

function input(overrides: Partial<ReviewWaitExitPolicyInput> = {}): ReviewWaitExitPolicyInput {
  return {
    active_branch: branch,
    live_head_sha: liveHead,
    last_status_readback_head_sha: repairedHead,
    spent_exit_ids: [],
    surface: surface(),
    ...overrides,
  };
}

test("requests final review after clear status, approved feedback, and promoted final-review surfaces", () => {
  const verdict = routeReviewWaitExitPolicy(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "request_final_review");
  assert.equal(verdict.head_sha, liveHead);
  assert.ok(verdict.decisive_evidence.includes("surface final-review-authority-bundle"));
  assert.deepEqual(verdict.warnings, ["warning-only status is allowed for final-review request"]);
});

test("routes changes-requested feedback into review repair instead of final-review request", () => {
  const verdict = routeReviewWaitExitPolicy(
    input({ surface: surface({ feedback_kind: "changes_requested", feedback_ids: ["review-thread-42"] }) }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "route_to_review_repair");
  assert.deepEqual(verdict.blockers, ["review repair required for review-thread-42"]);
});

test("holds while feedback is still pending", () => {
  const verdict = routeReviewWaitExitPolicy(
    input({ surface: surface({ feedback_kind: "pending", feedback_ids: [] }) }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "hold_review_wait");
  assert.deepEqual(verdict.blockers, ["review feedback state pending has not authorized final-review exit"]);
});

test("requires moved-head status when the live head moved and status is unknown", () => {
  const verdict = routeReviewWaitExitPolicy(
    input({ surface: surface({ status_verdict: "unknown" }) }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "read_moved_head_status");
  assert.deepEqual(verdict.blockers, [`fresh status/readback required for moved head ${liveHead}`]);
});

test("blocks stale review-wait exit surfaces", () => {
  const verdict = routeReviewWaitExitPolicy(
    input({ surface: surface({ head_sha: repairedHead }) }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_wrong_head");
  assert.deepEqual(verdict.blockers, [`review-wait exit head ${repairedHead} is not live head ${liveHead}`]);
});

test("blocks reused exit ids", () => {
  const verdict = routeReviewWaitExitPolicy(
    input({ spent_exit_ids: ["review-wait-exit-live-head"] }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_reused_exit");
});

test("blocks final-review request until required surfaces are promoted", () => {
  const verdict = routeReviewWaitExitPolicy(
    input({ surface: surface({ final_review_surface_ids: ["final-review-authority-bundle"] }) }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_final_review_surface");
  assert.deepEqual(verdict.blockers, [
    "missing final-review surface review-request-command",
    "missing final-review surface review-request-result-receipt",
  ]);
});

test("allows an exact external blocker to exit the wait state without a review request", () => {
  const verdict = routeReviewWaitExitPolicy(
    input({
      surface: surface({
        feedback_kind: "none",
        feedback_ids: [],
        exact_blocker: "external review authority is unavailable for the live PR head",
      }),
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "emit_exact_external_blocker");
  assert.deepEqual(verdict.blockers, ["external review authority is unavailable for the live PR head"]);
});
