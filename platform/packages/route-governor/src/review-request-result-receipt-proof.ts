import assert from "node:assert/strict";

import { compileReviewRequestResultReceipt } from "./review-request-result-receipt.js";

const head = "4e429ff2990b06a093e6288c572e68bb09ea3023";

const receipt = compileReviewRequestResultReceipt({
  command: {
    command_id: "review-request-command-live-head-001",
    operation: "request_pull_request_reviewers",
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch: "monday-platform-genesis-01",
    head_sha: head,
    reviewers: ["external-reviewer"],
    team_reviewers: ["platform-review-team"],
    guard: {
      require_live_head_sha: head,
      forbidden_fallbacks: ["duplicate_comment", "metadata_reread", "stale_repaired_head_status"],
    },
  },
  live_head_sha: head,
  api_result: {
    ok: true,
    requested_reviewers: ["external-reviewer"],
    requested_team_reviewers: ["platform-review-team"],
  },
  receipt_id: "review-request-result-live-head-001",
  spent_receipt_ids: [],
});

assert.equal(receipt.ok, true);
assert.equal(receipt.action, "compile_review_request_result_receipt");
assert.equal(receipt.next_route, "record review-request completion only for this live head and receipt id, then wait for reviewer response or merge gate movement");
assert.ok(receipt.decisive_evidence.includes(`live head ${head}`));

const blocker = compileReviewRequestResultReceipt({
  command: {
    command_id: "review-request-command-live-head-002",
    operation: "request_pull_request_reviewers",
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch: "monday-platform-genesis-01",
    head_sha: head,
    reviewers: ["external-reviewer"],
    team_reviewers: [],
    guard: {
      require_live_head_sha: head,
      forbidden_fallbacks: ["duplicate_comment", "metadata_reread", "stale_repaired_head_status"],
    },
  },
  live_head_sha: head,
  api_result: {
    ok: false,
    requested_reviewers: ["external-reviewer"],
    requested_team_reviewers: [],
    status_code: 403,
    error: "Resource not accessible by integration",
  },
  receipt_id: "review-request-result-live-head-002",
  spent_receipt_ids: [],
});

assert.equal(blocker.ok, false);
assert.equal(blocker.action, "emit_review_request_external_blocker");
assert.deepEqual(blocker.blockers, ["status 403: Resource not accessible by integration"]);
