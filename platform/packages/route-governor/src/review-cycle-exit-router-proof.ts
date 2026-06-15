import assert from "node:assert/strict";

import type { ContinuationStatusReceiptSurface } from "./index.js";
import type { ReviewResponseIntakeVerdict } from "./review-response-intake.js";
import { routeReviewCycleExit, type ReviewCycleExitInput } from "./review-cycle-exit-router.js";

const head = "2af8ab9b0a954f4fa433628f732251f990e85429";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

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

const admitted = routeReviewCycleExit(input());
assert.equal(admitted.ok, true);
assert.equal(admitted.action, "route_to_merge_gate");
assert.equal(admitted.head_sha, head);
assert.deepEqual(admitted.blockers, []);
assert(admitted.decisive_evidence.includes("approved by external-reviewer"));
assert(admitted.decisive_evidence.includes("Route Governor Proof / Route governor proof examples: success"));
assert.match(admitted.next_route, /authorized GitHub boundary/);

const missingStatus = routeReviewCycleExit(input({ status_surface: undefined }));
assert.equal(missingStatus.ok, false);
assert.equal(missingStatus.action, "read_live_head_status");
assert.deepEqual(missingStatus.blockers, [`no live-head status surface is attached for ${head}`]);

const staleReview = routeReviewCycleExit(input({ review: review({ head_sha: repairedHead }) }));
assert.equal(staleReview.ok, false);
assert.equal(staleReview.action, "block_stale_review_head");
assert.deepEqual(staleReview.blockers, [`review response head ${repairedHead} is not live head ${head}`]);

const changesRequested = routeReviewCycleExit(
  input({
    review: review({
      ok: false,
      action: "route_to_review_repair",
      approvals: [],
      change_requests: ["external-reviewer"],
      blockers: ["review changes requested by external-reviewer"],
    }),
  }),
);
assert.equal(changesRequested.ok, false);
assert.equal(changesRequested.action, "route_to_review_repair");
assert.deepEqual(changesRequested.blockers, ["review changes requested by external-reviewer"]);

const pendingChecks = routeReviewCycleExit(
  input({
    status_surface: status({
      verdict: "pending",
      ok: false,
      decisive_successes: [],
      pending_surfaces: ["Monday Platform CI is pending"],
    }),
  }),
);
assert.equal(pendingChecks.ok, false);
assert.equal(pendingChecks.action, "wait_for_checks");
assert.deepEqual(pendingChecks.blockers, ["Monday Platform CI is pending"]);

const failingChecks = routeReviewCycleExit(
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
assert.equal(failingChecks.ok, false);
assert.equal(failingChecks.action, "repair_status_failure");
assert.deepEqual(failingChecks.blockers, ["Route governor proof examples failed"]);

const unmergeable = routeReviewCycleExit(input({ mergeable: "unknown" }));
assert.equal(unmergeable.ok, false);
assert.equal(unmergeable.action, "block_unmergeable_pr");
assert.deepEqual(unmergeable.blockers, [`GitHub mergeability is not confirmed for head ${head}`]);

const exactBlocker = routeReviewCycleExit(
  input({ exact_external_blocker: "GitHub reviewer request is not accepted for any external target" }),
);
assert.equal(exactBlocker.ok, false);
assert.equal(exactBlocker.action, "emit_exact_external_blocker");
assert.deepEqual(exactBlocker.blockers, ["GitHub reviewer request is not accepted for any external target"]);

console.log("review cycle exit router proof passed");
