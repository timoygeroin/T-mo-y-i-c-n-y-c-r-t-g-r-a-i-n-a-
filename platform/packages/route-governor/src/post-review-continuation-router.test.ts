import assert from "node:assert/strict";
import { test } from "node:test";

import { routePostReviewContinuation, type PostReviewContinuationInput } from "./post-review-continuation-router.js";

const branch = "monday-platform-genesis-01";
const liveHead = "41005901d88e6c5266cb9abb278e68fe918eb834";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function input(overrides: Partial<PostReviewContinuationInput> = {}): PostReviewContinuationInput {
  return {
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch,
    active_branch: branch,
    live_head_sha: liveHead,
    last_repaired_head_sha: repairedHead,
    last_status_readback_head_sha: repairedHead,
    pr_state: "open",
    pr_is_draft: false,
    mergeable: true,
    blocker_issue_state: "closed",
    blocker_labels: [],
    live_status_verdict: "passing_with_warnings",
    requested_reviewers: ["platform-review"],
    approvals: [],
    change_requests: [],
    route_id: "post-review-continuation-4100590",
    spent_route_ids: [],
    ...overrides,
  };
}

test("waits for a live-head review response after the repaired-head boundary is retired", () => {
  const verdict = routePostReviewContinuation(input());

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "wait_for_review_response");
  assert.deepEqual(verdict.blockers, ["required live-head review response has not surfaced"]);
  assert.ok(verdict.decisive_evidence.includes(`last repaired head ${repairedHead}`));
});

test("routes approvals to merge gate without returning to repaired-head status readback", () => {
  const verdict = routePostReviewContinuation(
    input({
      requested_reviewers: ["platform-review"],
      approvals: ["platform-review"],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "route_to_merge_gate");
  assert.ok(verdict.next_route.includes("do not return to repaired-head status readback"));
});

test("routes change requests to review repair", () => {
  const verdict = routePostReviewContinuation(
    input({
      change_requests: ["platform-review"],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "route_to_review_repair");
  assert.deepEqual(verdict.blockers, ["review changes requested by platform-review"]);
});

test("blocks stale repaired-head blocker reuse after the live head moved", () => {
  const verdict = routePostReviewContinuation(
    input({
      known_external_blocker: `old status readback blocker for ${repairedHead}`,
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_repaired_head_blocker");
  assert.ok(verdict.blockers[0].includes(repairedHead));
});

test("blocks post-review routing while the CI boundary is still externally present", () => {
  const verdict = routePostReviewContinuation(
    input({
      blocker_issue_state: "closed",
      blocker_labels: ["blocked: ci-status-readback"],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_unretired_ci_boundary");
});

test("blocks replayed post-review route ids", () => {
  const verdict = routePostReviewContinuation(
    input({
      spent_route_ids: ["post-review-continuation-4100590"],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_replayed_route");
});
