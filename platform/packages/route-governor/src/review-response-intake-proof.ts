import assert from "node:assert/strict";

import { intakeReviewResponses } from "./review-response-intake.js";

const head = "2d557f2300e968c0c2a24a1494b4752fa00fccbc";
const receipt = {
  ok: true,
  action: "compile_review_request_result_receipt" as const,
  receipt_id: "review-request-result-live-head-004",
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

const approved = intakeReviewResponses({
  receipt,
  live_head_sha: head,
  review_surfaces: [{ reviewer: "external-reviewer", state: "approved", head_sha: head }],
  required_approval_count: 1,
});

assert.equal(approved.ok, true);
assert.equal(approved.action, "route_to_merge_gate");
assert.equal(approved.next_route, "enter merge gate only after live-head status and mergeability are still current");

const changes = intakeReviewResponses({
  receipt,
  live_head_sha: head,
  review_surfaces: [{ reviewer: "external-reviewer", state: "changes_requested", head_sha: head }],
  required_approval_count: 1,
});

assert.equal(changes.ok, false);
assert.equal(changes.action, "route_to_review_repair");
assert.deepEqual(changes.blockers, ["review changes requested by external-reviewer"]);

const waiting = intakeReviewResponses({
  receipt,
  live_head_sha: head,
  review_surfaces: [],
  required_approval_count: 1,
});

assert.equal(waiting.ok, false);
assert.equal(waiting.action, "wait_for_review_response");
assert.deepEqual(waiting.pending_reviewers, ["external-reviewer"]);
