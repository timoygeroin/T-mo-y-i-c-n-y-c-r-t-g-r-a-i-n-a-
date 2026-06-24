import assert from "node:assert/strict";
import { test } from "node:test";

import { gateReviewMergeRelease, type ReviewMergeReleaseGateInput } from "./review-merge-release-gate.js";

const branch = "monday-platform-genesis-01";
const head = "7ec5fb25f5f560f07c317bb92d251a1a1e971277";

function input(overrides: Partial<ReviewMergeReleaseGateInput> = {}): ReviewMergeReleaseGateInput {
  return {
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch,
    active_branch: branch,
    live_head_sha: head,
    status_head_sha: head,
    status_verdict: "passing_with_warnings",
    draft: false,
    mergeable: true,
    required_approval_count: 1,
    review_surfaces: [{ reviewer: "external-reviewer", state: "approved", head_sha: head }],
    blocking_failures: [],
    pending_surfaces: [],
    non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
    requested_action: "merge",
    ...overrides,
  };
}

test("enters the merge command only when status, review, and mergeability are current", () => {
  const verdict = gateReviewMergeRelease(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "enter_merge_command");
  assert.deepEqual(verdict.blockers, []);
  assert.equal(verdict.head_sha, head);
  assert.match(verdict.next_route, /live-head-bound merge command/);
});

test("blocks stale status surfaces from older heads", () => {
  const verdict = gateReviewMergeRelease(input({ status_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_surface");
  assert.deepEqual(verdict.blockers, [`status surface belongs to b38ea247602ae8ebba80c4120ad03b41b26bd841, not live head ${head}`]);
});

test("routes failing status to status repair before merge release", () => {
  const verdict = gateReviewMergeRelease(
    input({
      status_verdict: "failing",
      blocking_failures: ["Route Governor Proof / proof examples failed"],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "route_to_status_repair");
  assert.deepEqual(verdict.blockers, ["Route Governor Proof / proof examples failed"]);
});

test("routes current-head changes requested to review repair", () => {
  const verdict = gateReviewMergeRelease(
    input({
      review_surfaces: [{ reviewer: "external-reviewer", state: "changes_requested", head_sha: head }],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "route_to_review_repair");
  assert.deepEqual(verdict.blockers, ["review changes requested by external-reviewer"]);
});

test("waits for live-head approvals instead of treating a review request receipt as progress", () => {
  const verdict = gateReviewMergeRelease(input({ review_surfaces: [], requested_action: "wait_for_review" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "wait_for_review");
  assert.deepEqual(verdict.pending_reviewers, ["approval_required_1"]);
});

test("blocks draft or unmergeable PR state", () => {
  const draft = gateReviewMergeRelease(input({ draft: true }));
  assert.equal(draft.ok, false);
  assert.equal(draft.action, "block_draft_or_unmergeable");

  const unmergeable = gateReviewMergeRelease(input({ mergeable: false }));
  assert.equal(unmergeable.ok, false);
  assert.equal(unmergeable.action, "block_draft_or_unmergeable");
  assert.deepEqual(unmergeable.blockers, ["PR is not mergeable"]);
});

test("blocks non-progress merge substitutes", () => {
  const verdict = gateReviewMergeRelease(input({ requested_action: "duplicate_status_summary" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_progress");
  assert.deepEqual(verdict.blockers, ["requested action is not merge progress: duplicate_status_summary"]);
});
