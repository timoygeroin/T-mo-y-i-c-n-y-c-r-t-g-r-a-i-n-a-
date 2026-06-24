import test from "node:test";
import assert from "node:assert/strict";

import { compileMergeResultReceipt, type MergeResultReceiptInput } from "./merge-result-receipt.js";
import type { MergeCommand } from "./merge-command.js";

const head = "add065694ba79961b248f8d3a5b308a973d0ab8d";
const mergeSha = "02309124a6d7cf979ad6fbc004eeeafcb7bb8a84";
const staleHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function command(overrides: Partial<MergeCommand> = {}): MergeCommand {
  return {
    command_id: `merge-pr-2:${head}`,
    operation: "merge_pull_request",
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch: "monday-platform-genesis-01",
    expected_head_sha: head,
    merge_method: "squash",
    guard: {
      require_live_head_sha: head,
      require_handoff_action: "admit_merge",
      forbidden_fallbacks: ["unguarded_merge", "stale_repaired_head_status"],
    },
    ...overrides,
  };
}

function input(overrides: Partial<MergeResultReceiptInput> = {}): MergeResultReceiptInput {
  return {
    command: command(),
    live_head_sha: head,
    api_result: {
      ok: true,
      merged: true,
      merge_commit_sha: mergeSha,
      head_sha: head,
    },
    receipt_id: `merge-result-pr-2:${head}`,
    spent_receipt_ids: [],
    ...overrides,
  };
}

test("receipts a successful GitHub merge result for the guarded live head", () => {
  const receipt = compileMergeResultReceipt(input());

  assert.equal(receipt.ok, true);
  assert.equal(receipt.action, "compile_merge_result_receipt");
  assert.equal(receipt.merge_commit_sha, mergeSha);
  assert.equal(receipt.head_sha, head);
  assert(receipt.decisive_evidence.includes(`merge commit ${mergeSha}`));
});

test("blocks stale merge commands before treating GitHub output as completion", () => {
  const receipt = compileMergeResultReceipt(input({ command: command({ expected_head_sha: staleHead }) }));

  assert.equal(receipt.ok, false);
  assert.equal(receipt.action, "block_stale_command_head");
  assert(receipt.blockers.some((blocker) => blocker.includes(staleHead)));
});

test("blocks replayed merge result receipts", () => {
  const receipt = compileMergeResultReceipt(input({ spent_receipt_ids: [`merge-result-pr-2:${head}`] }));

  assert.equal(receipt.ok, false);
  assert.equal(receipt.action, "block_replayed_result_receipt");
});

test("turns an unmerged GitHub response into an exact external blocker", () => {
  const receipt = compileMergeResultReceipt(
    input({
      api_result: {
        ok: false,
        merged: false,
        status_code: 405,
        error: "Pull request is not mergeable",
        head_sha: head,
      },
    }),
  );

  assert.equal(receipt.ok, false);
  assert.equal(receipt.action, "block_unmerged_result");
  assert.deepEqual(receipt.blockers, ["status 405: Pull request is not mergeable"]);
});

test("requires a merge commit SHA before claiming merge completion", () => {
  const receipt = compileMergeResultReceipt(
    input({
      api_result: {
        ok: true,
        merged: true,
        head_sha: head,
      },
    }),
  );

  assert.equal(receipt.ok, false);
  assert.equal(receipt.action, "block_merge_sha_mismatch");
});
