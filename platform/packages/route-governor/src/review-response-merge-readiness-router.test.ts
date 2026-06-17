import assert from "node:assert/strict";
import test from "node:test";

import { compileMergeReadiness, type MergeReadinessInput } from "./merge-readiness.js";
import { intakeReviewResponses } from "./review-response-intake.js";
import { routeReviewResponseToMergeReadiness } from "./review-response-merge-readiness-router.js";

const head = "345315fb483064d040c34bbbb126ee9c3406682f";
const receipt = {
  ok: true,
  action: "compile_review_request_result_receipt" as const,
  receipt_id: "review-request-result-live-head-005",
  operation: "request_pull_request_reviewers" as const,
  repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
  pr_number: 2,
  branch: "monday-platform-genesis-01",
  head_sha: head,
  reviewers: ["external-reviewer"],
  team_reviewers: [],
  decisive_evidence: [`live head ${head}`, "reviewer:external-reviewer"],
  blockers: [],
  next_route: "record review-request completion only for this live head",
};

function mergeReadiness(overrides: Partial<MergeReadinessInput> = {}): MergeReadinessInput {
  return {
    repository_full_name: receipt.repository_full_name,
    pr_number: receipt.pr_number,
    branch: receipt.branch,
    active_branch: receipt.branch,
    head_sha: head,
    draft: false,
    mergeable: true,
    status_surface: {
      verdict: "passing_with_warnings",
      ok: true,
      decisive_successes: ["Route Governor Proof succeeded for reviewed live head"],
      blocking_failures: [],
      pending_surfaces: [],
      non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
    },
    evidence: {
      executable_artifacts: ["routeReviewResponseToMergeReadiness"],
      routing_artifacts: ["review response to merge-readiness router"],
      status_surface_ids: ["Route Governor Proof pull_request current-head surface"],
    },
    ...overrides,
  };
}

test("approved live-head review routes through current merge readiness", () => {
  const review = intakeReviewResponses({
    receipt,
    live_head_sha: head,
    review_surfaces: [{ reviewer: "external-reviewer", state: "approved", head_sha: head }],
    required_approval_count: 1,
  });

  const routed = routeReviewResponseToMergeReadiness({ review, merge_readiness: mergeReadiness() });

  assert.equal(routed.ok, true);
  assert.equal(routed.action, "route_to_merge_ready");
  assert.equal(routed.merge_readiness?.action, "merge_ready");
  assert.deepEqual(routed.blockers, []);
  assert.match(routed.next_route, /guarded GitHub merge command/);
});

test("approved review without status surface must read current-head status first", () => {
  const review = intakeReviewResponses({
    receipt,
    live_head_sha: head,
    review_surfaces: [{ reviewer: "external-reviewer", state: "approved", head_sha: head }],
    required_approval_count: 1,
  });

  const routed = routeReviewResponseToMergeReadiness({
    review,
    merge_readiness: mergeReadiness({ status_surface: undefined }),
  });

  assert.equal(routed.ok, true);
  assert.equal(routed.action, "read_current_head_status");
  assert.equal(routed.merge_readiness?.action, "read_current_head_status");
});

test("review changes route to repair before merge readiness", () => {
  const review = intakeReviewResponses({
    receipt,
    live_head_sha: head,
    review_surfaces: [{ reviewer: "external-reviewer", state: "changes_requested", head_sha: head }],
    required_approval_count: 1,
  });

  const routed = routeReviewResponseToMergeReadiness({ review, merge_readiness: mergeReadiness() });

  assert.equal(routed.ok, false);
  assert.equal(routed.action, "route_to_review_repair");
  assert.deepEqual(routed.blockers, ["review changes requested by external-reviewer"]);
  assert.equal(routed.merge_readiness, null);
});

test("missing review response waits instead of using merge readiness", () => {
  const review = intakeReviewResponses({
    receipt,
    live_head_sha: head,
    review_surfaces: [],
    required_approval_count: 1,
  });

  const routed = routeReviewResponseToMergeReadiness({ review, merge_readiness: mergeReadiness() });

  assert.equal(routed.ok, false);
  assert.equal(routed.action, "wait_for_review_response");
  assert.equal(routed.merge_readiness, null);
});

test("stale merge readiness input is blocked before merge routing", () => {
  const review = intakeReviewResponses({
    receipt,
    live_head_sha: head,
    review_surfaces: [{ reviewer: "external-reviewer", state: "approved", head_sha: head }],
    required_approval_count: 1,
  });

  const routed = routeReviewResponseToMergeReadiness({
    review,
    merge_readiness: mergeReadiness({ head_sha: "stale-head" }),
  });

  assert.equal(routed.ok, false);
  assert.equal(routed.action, "block_stale_merge_readiness_input");
  assert.deepEqual(routed.blockers, [`merge readiness head stale-head does not match review head ${head}`]);
});

test("router preserves merge-readiness blockers", () => {
  const review = intakeReviewResponses({
    receipt,
    live_head_sha: head,
    review_surfaces: [{ reviewer: "external-reviewer", state: "approved", head_sha: head }],
    required_approval_count: 1,
  });
  const readiness = compileMergeReadiness(mergeReadiness({ mergeable: false }));

  const routed = routeReviewResponseToMergeReadiness({
    review,
    merge_readiness: mergeReadiness({ mergeable: false }),
  });

  assert.equal(readiness.action, "block_release");
  assert.equal(routed.ok, false);
  assert.equal(routed.action, "block_release");
  assert.deepEqual(routed.blockers, readiness.blockers);
});
