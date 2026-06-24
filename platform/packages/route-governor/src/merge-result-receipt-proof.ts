import assert from "node:assert/strict";

import { compileMergeResultReceipt } from "./merge-result-receipt.js";
import type { MergeCommand } from "./merge-command.js";

const head = "add065694ba79961b248f8d3a5b308a973d0ab8d";
const mergeSha = "02309124a6d7cf979ad6fbc004eeeafcb7bb8a84";

const command: MergeCommand = {
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
};

const receipt = compileMergeResultReceipt({
  command,
  live_head_sha: head,
  api_result: {
    ok: true,
    merged: true,
    merge_commit_sha: mergeSha,
    head_sha: head,
  },
  receipt_id: `merge-result-pr-2:${head}`,
  spent_receipt_ids: [],
});

assert.equal(receipt.ok, true);
assert.equal(receipt.action, "compile_merge_result_receipt");
assert.equal(receipt.merge_commit_sha, mergeSha);
assert.equal(receipt.next_route, "treat PR merge completion as receipted only for this live head and merge commit SHA");

const unmerged = compileMergeResultReceipt({
  command,
  live_head_sha: head,
  api_result: {
    ok: false,
    merged: false,
    status_code: 405,
    error: "Pull request is not mergeable",
    head_sha: head,
  },
  receipt_id: `merge-result-blocker-pr-2:${head}`,
  spent_receipt_ids: [],
});

assert.equal(unmerged.ok, false);
assert.equal(unmerged.action, "block_unmerged_result");
assert.deepEqual(unmerged.blockers, ["status 405: Pull request is not mergeable"]);

console.log("merge result receipt proof passed");
