import test from "node:test";
import assert from "node:assert/strict";

import type { FinalReviewExecutionWindowVerdict } from "./final-review-execution-window.js";
import type { MergeResultReceipt } from "./merge-result-receipt.js";
import type { ReviewRequestResultReceipt } from "./review-request-result-receipt.js";
import {
  consumeExecutionWindowReceipt,
  type ExecutionWindowConsumptionInput,
} from "./execution-window-consumption-receipt.js";

const branch = "monday-platform-genesis-01";
const head = "e1f91e43bd03fe28ec3b03fe2370eb20ff3a1ae7";

function reviewWindow(overrides: Partial<FinalReviewExecutionWindowVerdict> = {}): FinalReviewExecutionWindowVerdict {
  return {
    ok: true,
    action: "execute_final_review_command",
    window_id: "final-review-window-01",
    branch,
    head_sha: head,
    decisive_evidence: ["command request_final_review", `live head ${head}`],
    blockers: [],
    next_route: "execute once",
    ...overrides,
  };
}

function reviewReceipt(overrides: Partial<ReviewRequestResultReceipt> = {}): ReviewRequestResultReceipt {
  return {
    ok: true,
    action: "compile_review_request_result_receipt",
    receipt_id: "review-request-result-01",
    operation: "request_pull_request_reviewers",
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch,
    head_sha: head,
    reviewers: ["timoygeroin"],
    team_reviewers: [],
    decisive_evidence: ["reviewer:timoygeroin"],
    blockers: [],
    next_route: "wait for review feedback",
    ...overrides,
  };
}

function mergeReceipt(overrides: Partial<MergeResultReceipt> = {}): MergeResultReceipt {
  return {
    ok: true,
    action: "compile_merge_result_receipt",
    receipt_id: "merge-result-01",
    operation: "merge_pull_request",
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch,
    head_sha: head,
    merge_method: "squash",
    merge_commit_sha: "abc123",
    decisive_evidence: ["merge commit abc123"],
    blockers: [],
    next_route: "merge receipted",
    ...overrides,
  };
}

function input(overrides: Partial<ExecutionWindowConsumptionInput> = {}): ExecutionWindowConsumptionInput {
  return {
    active_branch: branch,
    live_head_sha: head,
    consumption_id: "consume-final-review-window-01",
    spent_consumption_ids: [],
    window: reviewWindow(),
    receipt: reviewReceipt(),
    ...overrides,
  };
}

test("accepts a review request receipt that matches the execution window", () => {
  const verdict = consumeExecutionWindowReceipt(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "accept_execution_window_consumption");
  assert.equal(verdict.operation, "request_pull_request_reviewers");
  assert.deepEqual(verdict.blockers, []);
});

test("blocks consuming a receipt when the execution window was not opened", () => {
  const verdict = consumeExecutionWindowReceipt(
    input({ window: reviewWindow({ ok: false, action: "block_missing_lease", blockers: ["missing status lease"] }) }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_unopened_window");
  assert.deepEqual(verdict.blockers, ["execution window did not admit a final review command"]);
});

test("blocks stale command receipts from a different head", () => {
  const verdict = consumeExecutionWindowReceipt(input({ receipt: reviewReceipt({ head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }) }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_receipt_head_mismatch");
});

test("blocks operation mismatch between window command and receipt", () => {
  const verdict = consumeExecutionWindowReceipt(input({ receipt: mergeReceipt() }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_command_mismatch");
});

test("accepts a merge receipt only when the window admitted merge finalization", () => {
  const verdict = consumeExecutionWindowReceipt(
    input({
      window: reviewWindow({ decisive_evidence: ["command merge_finalization", `live head ${head}`] }),
      receipt: mergeReceipt(),
      consumption_id: "consume-merge-window-01",
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "accept_execution_window_consumption");
  assert.equal(verdict.operation, "merge_pull_request");
});

test("blocks failed external command receipts", () => {
  const verdict = consumeExecutionWindowReceipt(
    input({ receipt: reviewReceipt({ ok: false, blockers: ["status 422: reviewer request rejected"] }) }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_failed_command_receipt");
  assert.deepEqual(verdict.blockers, ["status 422: reviewer request rejected"]);
});
