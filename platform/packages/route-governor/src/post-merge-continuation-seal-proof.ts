import assert from "node:assert/strict";

import { compilePostMergeContinuationSeal } from "./post-merge-continuation-seal.js";
import type { MergeResultReceipt } from "./merge-result-receipt.js";

const head = "98d7faf8b336379ff3ddc12e135b8267c623e8d2";
const mergeCommit = "5b00955e139b33a72a40986f1faa12d6700427ed";

const receipt: MergeResultReceipt = {
  ok: true,
  action: "compile_merge_result_receipt",
  receipt_id: `merge-result-pr-2:${head}`,
  operation: "merge_pull_request",
  repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
  pr_number: 2,
  branch: "monday-platform-genesis-01",
  head_sha: head,
  merge_method: "squash",
  merge_commit_sha: mergeCommit,
  decisive_evidence: [`live head ${head}`, `merge commit ${mergeCommit}`],
  blockers: [],
  next_route: "treat PR merge completion as receipted only for this live head and merge commit SHA",
};

const sealed = compilePostMergeContinuationSeal({
  receipt,
  live_head_sha: head,
  expected_branch: "monday-platform-genesis-01",
  seal_id: `post-merge-seal-pr-2:${mergeCommit}`,
  spent_seal_ids: [],
  requested_next_move: "seal_manifestation_cycle",
});

assert.equal(sealed.ok, true);
assert.equal(sealed.action, "seal_external_manifestation");
assert.equal(sealed.merge_commit_sha, mergeCommit);
assert.ok(sealed.decisive_evidence.includes(`continue from merge commit ${mergeCommit}`));

const branchReplay = compilePostMergeContinuationSeal({
  receipt,
  live_head_sha: head,
  expected_branch: "monday-platform-genesis-01",
  seal_id: `post-merge-seal-pr-2:${mergeCommit}:replay-attempt`,
  spent_seal_ids: [],
  requested_next_move: "status_readback",
});

assert.equal(branchReplay.ok, false);
assert.equal(branchReplay.action, "block_post_merge_pr_continuation");

console.log("post-merge continuation seal proof passed");
