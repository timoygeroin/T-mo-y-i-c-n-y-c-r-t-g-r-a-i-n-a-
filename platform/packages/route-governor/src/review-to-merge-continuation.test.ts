import test from "node:test";
import assert from "node:assert/strict";

import { routeReviewToMergeContinuation, type ReviewToMergeContinuationInput } from "./review-to-merge-continuation.js";
import type { ReviewResponseIntakeVerdict } from "./review-response-intake.js";

const branch = "monday-platform-genesis-01";
const head = "live-head-under-test";

function reviewIntake(overrides: Partial<ReviewResponseIntakeVerdict> = {}): ReviewResponseIntakeVerdict {
  return {
    ok: true,
    action: "route_to_merge_gate",
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch,
    head_sha: head,
    approvals: ["external-reviewer"],
    change_requests: [],
    pending_reviewers: [],
    decisive_evidence: [`live head ${head}`, "approved by external-reviewer"],
    blockers: [],
    next_route: "enter merge gate only after live-head status and mergeability are still current",
    ...overrides,
  };
}

function input(overrides: Partial<ReviewToMergeContinuationInput> = {}): ReviewToMergeContinuationInput {
  return {
    review_intake: reviewIntake(),
    active_branch: branch,
    live_head_sha: head,
    draft: false,
    mergeable: true,
    required_approval_count: 1,
    promoted_surface_ids: ["merge-finalization-command-public-surface", "merge-result-receipt-public-surface"],
    status_surface: {
      surface_id: "current-head-status-readback-fixture",
      head_sha: head,
      verdict: "passing_with_warnings",
      decisive_successes: ["Route Governor Proof / proof examples: success"],
      blocking_failures: [],
      pending_surfaces: [],
      non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
    },
    ...overrides,
  };
}

test("approved live-head review, passing status, mergeability, and promoted surfaces compile merge command seed", () => {
  const verdict = routeReviewToMergeContinuation(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "compile_merge_finalization_command");
  assert.equal(verdict.command_seed?.operation, "compile_merge_finalization_command");
  assert.equal(verdict.command_seed?.live_head_sha, head);
  assert.equal(verdict.warnings.length, 1);
});

test("review approval cannot cross a stale head boundary", () => {
  const verdict = routeReviewToMergeContinuation(
    input({ review_intake: reviewIntake({ head_sha: "stale-head" }) }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_review_intake");
  assert.deepEqual(verdict.blockers, [`review intake head stale-head is not live head ${head}`]);
});

test("changes requested route to review repair instead of merge", () => {
  const verdict = routeReviewToMergeContinuation(
    input({
      review_intake: reviewIntake({
        ok: false,
        action: "route_to_review_repair",
        approvals: [],
        change_requests: ["external-reviewer"],
        blockers: ["review changes requested by external-reviewer"],
      }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "route_to_review_repair");
  assert.deepEqual(verdict.blockers, ["review changes requested by external-reviewer"]);
});

test("missing current-head status routes to readback before merge command compilation", () => {
  const verdict = routeReviewToMergeContinuation(input({ status_surface: undefined }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "read_current_head_status");
  assert.deepEqual(verdict.blockers, []);
});

test("pending checks wait and failing checks repair before merge continuation", () => {
  const pending = routeReviewToMergeContinuation(
    input({
      status_surface: {
        surface_id: "pending-status",
        head_sha: head,
        verdict: "pending",
        decisive_successes: [],
        blocking_failures: [],
        pending_surfaces: ["Monday Platform CI / Route governor proof surface"],
        non_blocking_warnings: [],
      },
    }),
  );

  assert.equal(pending.ok, false);
  assert.equal(pending.action, "wait_for_checks");

  const failing = routeReviewToMergeContinuation(
    input({
      status_surface: {
        surface_id: "failing-status",
        head_sha: head,
        verdict: "failing",
        decisive_successes: [],
        blocking_failures: ["Route Governor Proof / proof examples failed"],
        pending_surfaces: [],
        non_blocking_warnings: [],
      },
    }),
  );

  assert.equal(failing.ok, false);
  assert.equal(failing.action, "repair_status_failure");
});

test("mergeability and promoted finalization surfaces are required after approval", () => {
  const unmergeable = routeReviewToMergeContinuation(input({ mergeable: "unknown" }));

  assert.equal(unmergeable.ok, false);
  assert.equal(unmergeable.action, "block_mergeability_unknown");

  const missingSurface = routeReviewToMergeContinuation(
    input({ promoted_surface_ids: ["merge-finalization-command-public-surface"] }),
  );

  assert.equal(missingSurface.ok, false);
  assert.equal(missingSurface.action, "block_missing_finalization_surface");
  assert.deepEqual(missingSurface.blockers, ["missing promoted finalization surface merge-result-receipt-public-surface"]);
});
