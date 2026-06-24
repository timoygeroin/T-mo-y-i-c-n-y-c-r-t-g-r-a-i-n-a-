import assert from "node:assert/strict";
import { test } from "node:test";

import type { ContinuationStatusReceiptSurface } from "./index.js";
import type { ReviewResponseIntakeVerdict } from "./review-response-intake.js";
import { routeReviewCycleExit, type ReviewCycleExitInput } from "./review-cycle-exit-router.js";

const head = "3bf8e07dce32e59accf776357fb22278f57ba3f5";

function review(overrides: Partial<ReviewResponseIntakeVerdict> = {}): ReviewResponseIntakeVerdict {
  return {
    ok: true,
    action: "route_to_merge_gate",
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch: "monday-platform-genesis-01",
    head_sha: head,
    approvals: ["external-reviewer"],
    change_requests: [],
    pending_reviewers: [],
    decisive_evidence: [`receipt head ${head}`, "approved by external-reviewer"],
    blockers: [],
    next_route: "enter merge gate only after live-head status and mergeability are still current",
    ...overrides,
  };
}

function status(overrides: Partial<ContinuationStatusReceiptSurface> = {}): ContinuationStatusReceiptSurface {
  return {
    verdict: "passing_with_warnings",
    ok: true,
    decisive_successes: ["Route Governor Proof / Route governor proof examples: success"],
    blocking_failures: [],
    pending_surfaces: [],
    non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
    ...overrides,
  };
}

function input(overrides: Partial<ReviewCycleExitInput> = {}): ReviewCycleExitInput {
  return {
    review: review(),
    live_head_sha: head,
    draft: false,
    mergeable: true,
    status_surface: status(),
    ...overrides,
  };
}

test("routes approved review, live status, and mergeable PR into merge gate", () => {
  const verdict = routeReviewCycleExit(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "route_to_merge_gate");
  assert.deepEqual(verdict.blockers, []);
  assert.ok(verdict.decisive_evidence.includes("approved by external-reviewer"));
  assert.ok(verdict.decisive_evidence.includes("Route Governor Proof / Route governor proof examples: success"));
});

test("requires live-head status before merge-gate routing", () => {
  const verdict = routeReviewCycleExit(input({ status_surface: undefined }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "read_live_head_status");
  assert.deepEqual(verdict.blockers, [`no live-head status surface is attached for ${head}`]);
});

test("routes review change requests into review repair", () => {
  const verdict = routeReviewCycleExit(
    input({
      review: review({
        ok: false,
        action: "route_to_review_repair",
        approvals: [],
        change_requests: ["external-reviewer"],
        blockers: ["review changes requested by external-reviewer"],
        next_route: "repair the live-head review changes before requesting merge readiness",
      }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "route_to_review_repair");
  assert.deepEqual(verdict.blockers, ["review changes requested by external-reviewer"]);
});

test("waits when the live-head review response is still pending", () => {
  const verdict = routeReviewCycleExit(
    input({
      review: review({
        ok: false,
        action: "wait_for_review_response",
        approvals: [],
        pending_reviewers: ["external-reviewer"],
        blockers: ["required review approval has not surfaced on the live head"],
      }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "wait_for_review_response");
  assert.deepEqual(verdict.blockers, ["required review approval has not surfaced on the live head"]);
});

test("blocks stale review responses from older heads", () => {
  const verdict = routeReviewCycleExit(
    input({ review: review({ head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }) }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_review_head");
  assert.deepEqual(verdict.blockers, [
    `review response head b38ea247602ae8ebba80c4120ad03b41b26bd841 is not live head ${head}`,
  ]);
});

test("waits for pending live-head checks", () => {
  const verdict = routeReviewCycleExit(
    input({
      status_surface: status({
        verdict: "pending",
        ok: false,
        decisive_successes: [],
        pending_surfaces: ["Monday Platform CI is pending"],
      }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "wait_for_checks");
  assert.deepEqual(verdict.blockers, ["Monday Platform CI is pending"]);
});

test("routes failing live-head status into status repair", () => {
  const verdict = routeReviewCycleExit(
    input({
      status_surface: status({
        verdict: "failing",
        ok: false,
        decisive_successes: [],
        blocking_failures: ["Route governor proof examples failed"],
        non_blocking_warnings: [],
      }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "repair_status_failure");
  assert.deepEqual(verdict.blockers, ["Route governor proof examples failed"]);
});

test("blocks merge-gate routing when GitHub mergeability is not confirmed", () => {
  const verdict = routeReviewCycleExit(input({ mergeable: "unknown" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_unmergeable_pr");
  assert.deepEqual(verdict.blockers, [`GitHub mergeability is not confirmed for head ${head}`]);
});

test("emits an exact external blocker before merge-gate routing", () => {
  const verdict = routeReviewCycleExit(input({ exact_external_blocker: "GitHub reviewer request is not accepted for any external target" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "emit_exact_external_blocker");
  assert.deepEqual(verdict.blockers, ["GitHub reviewer request is not accepted for any external target"]);
});
