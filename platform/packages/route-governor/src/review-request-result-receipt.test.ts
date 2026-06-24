import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  compileReviewRequestResultReceipt,
  type ReviewRequestResultReceiptInput,
} from "./review-request-result-receipt.js";

const head = "4e429ff2990b06a093e6288c572e68bb09ea3023";
const staleHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function input(overrides: Partial<ReviewRequestResultReceiptInput> = {}): ReviewRequestResultReceiptInput {
  return {
    command: {
      command_id: "review-request-command-001",
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
    receipt_id: "review-request-result-001",
    spent_receipt_ids: [],
    ...overrides,
  };
}

describe("compileReviewRequestResultReceipt", () => {
  it("admits a GitHub review-request result bound to the live command head", () => {
    const receipt = compileReviewRequestResultReceipt(input());

    assert.equal(receipt.ok, true);
    assert.equal(receipt.action, "compile_review_request_result_receipt");
    assert.equal(receipt.head_sha, head);
    assert.deepEqual(receipt.reviewers, ["external-reviewer"]);
    assert.deepEqual(receipt.team_reviewers, ["platform-review-team"]);
    assert.ok(receipt.decisive_evidence.includes(`live head ${head}`));
  });

  it("blocks result intake from a stale command head", () => {
    const receipt = compileReviewRequestResultReceipt(
      input({ command: { ...input().command, head_sha: staleHead } }),
    );

    assert.equal(receipt.ok, false);
    assert.equal(receipt.action, "block_stale_command_head");
    assert.deepEqual(receipt.blockers, [`review request command head ${staleHead} is not live head ${head}`]);
  });

  it("blocks target drift between command and GitHub result", () => {
    const receipt = compileReviewRequestResultReceipt(
      input({ api_result: { ok: true, requested_reviewers: ["other-reviewer"], requested_team_reviewers: ["platform-review-team"] } }),
    );

    assert.equal(receipt.ok, false);
    assert.equal(receipt.action, "block_target_drift");
  });

  it("emits the exact external blocker surfaced by GitHub", () => {
    const receipt = compileReviewRequestResultReceipt(
      input({
        api_result: {
          ok: false,
          requested_reviewers: ["external-reviewer"],
          requested_team_reviewers: ["platform-review-team"],
          status_code: 422,
          error: "Review cannot be requested from pull request author",
        },
      }),
    );

    assert.equal(receipt.ok, false);
    assert.equal(receipt.action, "emit_review_request_external_blocker");
    assert.deepEqual(receipt.blockers, ["status 422: Review cannot be requested from pull request author"]);
  });

  it("blocks replayed result receipts", () => {
    const receipt = compileReviewRequestResultReceipt(
      input({ spent_receipt_ids: ["review-request-result-001"] }),
    );

    assert.equal(receipt.ok, false);
    assert.equal(receipt.action, "block_replayed_result_receipt");
  });
});
