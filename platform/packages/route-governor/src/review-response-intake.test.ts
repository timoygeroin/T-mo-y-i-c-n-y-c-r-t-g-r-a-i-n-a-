import assert from "node:assert/strict";
import { test } from "node:test";

import { intakeReviewResponses, type ReviewResponseIntakeInput } from "./review-response-intake.js";
import type { ReviewRequestResultReceipt } from "./review-request-result-receipt.js";

const head = "1fe2fbdd7c19759498fad3effcf28d62da64ae42";
const staleHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function receipt(overrides: Partial<ReviewRequestResultReceipt> = {}): ReviewRequestResultReceipt {
  return {
    ok: true,
    action: "compile_review_request_result_receipt",
    receipt_id: "review-request-result-live-head-003",
    operation: "request_pull_request_reviewers",
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch: "monday-platform-genesis-01",
    head_sha: head,
    reviewers: ["external-reviewer"],
    team_reviewers: [],
    decisive_evidence: [`live head ${head}`, "reviewer:external-reviewer"],
    blockers: [],
    next_route: "record review-request completion only for this live head",
    ...overrides,
  };
}

function input(overrides: Partial<ReviewResponseIntakeInput> = {}): ReviewResponseIntakeInput {
  return {
    receipt: receipt(),
    live_head_sha: head,
    review_surfaces: [],
    required_approval_count: 1,
    ...overrides,
  };
}

test("routes an approved live-head review response to the merge gate", () => {
  const verdict = intakeReviewResponses(
    input({
      review_surfaces: [{ reviewer: "external-reviewer", state: "approved", head_sha: head }],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "route_to_merge_gate");
  assert.deepEqual(verdict.approvals, ["external-reviewer"]);
  assert.deepEqual(verdict.blockers, []);
});

test("routes live-head changes requested to review repair", () => {
  const verdict = intakeReviewResponses(
    input({
      review_surfaces: [{ reviewer: "external-reviewer", state: "changes_requested", head_sha: head }],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "route_to_review_repair");
  assert.deepEqual(verdict.change_requests, ["external-reviewer"]);
  assert.deepEqual(verdict.blockers, ["review changes requested by external-reviewer"]);
});

test("waits when no required approval is present", () => {
  const verdict = intakeReviewResponses(input());

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "wait_for_review_response");
  assert.deepEqual(verdict.pending_reviewers, ["external-reviewer"]);
});

test("blocks stale review receipts", () => {
  const verdict = intakeReviewResponses(input({ receipt: receipt({ head_sha: staleHead }) }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_review_receipt");
  assert.deepEqual(verdict.blockers, [`review request receipt head ${staleHead} is not live head ${head}`]);
});

test("blocks unreceipted review requests", () => {
  const verdict = intakeReviewResponses(
    input({
      receipt: receipt({
        ok: false,
        action: "emit_review_request_external_blocker",
        blockers: ["status 403: Resource not accessible by integration"],
      }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_unreceipted_review_request");
  assert(verdict.blockers.includes("status 403: Resource not accessible by integration"));
});

test("emits exact review-response blockers before merge or repair routing", () => {
  const verdict = intakeReviewResponses(input({ known_external_blocker: "GitHub review API returned no review timeline" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "emit_review_response_blocker");
  assert.deepEqual(verdict.blockers, ["GitHub review API returned no review timeline"]);
});
