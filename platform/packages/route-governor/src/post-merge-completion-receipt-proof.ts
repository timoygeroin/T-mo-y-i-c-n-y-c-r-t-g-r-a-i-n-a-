import assert from "node:assert/strict";

import { compilePostMergeCompletionReceipt, type PostMergeCompletionSurface } from "./post-merge-completion-receipt.js";

const head = "4fbd48ca4539986c874f85394188c405b8d25600";

function surface(overrides: Partial<PostMergeCompletionSurface> = {}): PostMergeCompletionSurface {
  return {
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch: "monday-platform-genesis-01",
    head_sha: head,
    state: "closed",
    merged: true,
    merged_at: "2026-06-24T22:03:25Z",
    merge_commit_sha: "744387e081b4126ddba74d03ee11588e76ed3789",
    evidence: [
      "connector PR metadata state closed",
      "connector PR metadata merged true",
      "connector PR metadata merge commit 744387e081b4126ddba74d03ee11588e76ed3789",
    ],
    ...overrides,
  };
}

const sealed = compilePostMergeCompletionReceipt({
  active_branch: "monday-platform-genesis-01",
  live_head_sha: head,
  receipt_id: "post-merge-completion-pr-2-001",
  spent_receipt_ids: [],
  surface: surface(),
});

assert.equal(sealed.ok, true);
assert.equal(sealed.action, "seal_post_merge_completion");
assert.equal(sealed.next_route, "treat this PR sink as completed; future embodiment must use a new explicit external sink");
assert.deepEqual(sealed.blockers, []);
assert(sealed.decisive_evidence.includes("merged at 2026-06-24T22:03:25Z"));
assert(sealed.decisive_evidence.includes("merge commit 744387e081b4126ddba74d03ee11588e76ed3789"));

const open = compilePostMergeCompletionReceipt({
  active_branch: "monday-platform-genesis-01",
  live_head_sha: head,
  receipt_id: "post-merge-completion-pr-2-002",
  spent_receipt_ids: [],
  surface: surface({ state: "open", merged: false }),
});

assert.equal(open.ok, false);
assert.equal(open.action, "block_unmerged_pr");
assert.deepEqual(open.blockers, ["PR 2 is not a closed merged PR"]);

const stale = compilePostMergeCompletionReceipt({
  active_branch: "monday-platform-genesis-01",
  live_head_sha: head,
  receipt_id: "post-merge-completion-pr-2-003",
  spent_receipt_ids: [],
  surface: surface({ head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }),
});

assert.equal(stale.ok, false);
assert.equal(stale.action, "block_stale_merge_head");
assert.deepEqual(stale.blockers, [
  `merged PR head b38ea247602ae8ebba80c4120ad03b41b26bd841 is not live head ${head}`,
]);

const missingEvidence = compilePostMergeCompletionReceipt({
  active_branch: "monday-platform-genesis-01",
  live_head_sha: head,
  receipt_id: "post-merge-completion-pr-2-004",
  spent_receipt_ids: [],
  surface: surface({ evidence: [], merge_commit_sha: null }),
});

assert.equal(missingEvidence.ok, false);
assert.equal(missingEvidence.action, "block_missing_merge_evidence");
assert.deepEqual(missingEvidence.blockers, [
  "post-merge completion requires merged_at, merge_commit_sha, and external evidence",
]);

const repeated = compilePostMergeCompletionReceipt({
  active_branch: "monday-platform-genesis-01",
  live_head_sha: head,
  receipt_id: "post-merge-completion-pr-2-001",
  spent_receipt_ids: ["post-merge-completion-pr-2-001"],
  surface: surface(),
});

assert.equal(repeated.ok, false);
assert.equal(repeated.action, "block_repeated_receipt");
assert.deepEqual(repeated.blockers, [
  "post-merge completion receipt already spent: post-merge-completion-pr-2-001",
]);

console.log("post-merge completion receipt proof passed");
