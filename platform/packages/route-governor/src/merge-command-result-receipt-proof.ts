import assert from "node:assert/strict";

import type { MergeCommand } from "./merge-command-admission.js";
import { compileMergeCommandResultReceipt } from "./merge-command-result-receipt.js";

const head = "e6b5b11516615e75d18472281ea3449a14588ee2";
const command: MergeCommand = {
  command_id: "merge-command-live-head-proof",
  operation: "merge_pull_request",
  repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
  pr_number: 2,
  branch: "monday-platform-genesis-01",
  expected_head_sha: head,
  merge_method: "squash",
  guard: {
    require_live_head_sha: head,
    forbidden_fallbacks: ["duplicate_comment", "metadata_reread", "stale_repaired_head_status"],
  },
};

const merged = compileMergeCommandResultReceipt({
  command,
  live_head_sha: head,
  receipt_id: "merge-result-live-head-proof",
  spent_receipt_ids: [],
  api_result: {
    ok: true,
    merged: true,
    merge_commit_sha: "1111111111111111111111111111111111111111",
  },
});

assert.equal(merged.ok, true);
assert.equal(merged.action, "compile_merge_result_receipt");
assert.match(merged.next_route, /post-merge closeout/);

const stale = compileMergeCommandResultReceipt({
  command,
  live_head_sha: "2222222222222222222222222222222222222222",
  receipt_id: "merge-result-stale-proof",
  spent_receipt_ids: [],
  api_result: {
    ok: true,
    merged: true,
    merge_commit_sha: "1111111111111111111111111111111111111111",
  },
});

assert.equal(stale.ok, false);
assert.equal(stale.action, "block_stale_merge_command");

const blocked = compileMergeCommandResultReceipt({
  command,
  live_head_sha: head,
  receipt_id: "merge-result-blocked-proof",
  spent_receipt_ids: [],
  api_result: {
    ok: false,
    merged: false,
    status_code: 405,
    error: "Required status check is expected",
  },
});

assert.equal(blocked.ok, false);
assert.equal(blocked.action, "emit_merge_external_blocker");

console.log("merge command result receipt proof passed");
