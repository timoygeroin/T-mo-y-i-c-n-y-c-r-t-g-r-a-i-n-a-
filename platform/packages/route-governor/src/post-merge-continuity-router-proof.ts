import assert from "node:assert/strict";

import { routePostMergeContinuity } from "./post-merge-continuity-router.js";
import type { MergeResultReceipt } from "./merge-result-receipt.js";

const head = "d22bf8d4cf0796dd7c40dcc2cfcf8dd9c1778d0d";
const mergeSha = "c7081710fc61db573e5b9722fa62010c724f69d0";

const receipt: MergeResultReceipt = {
  ok: true,
  action: "compile_merge_result_receipt",
  receipt_id: "merge-result-live-head-001",
  operation: "merge_pull_request",
  repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
  pr_number: 2,
  branch: "monday-platform-genesis-01",
  head_sha: head,
  merge_method: "squash",
  merge_commit_sha: mergeSha,
  decisive_evidence: [`live head ${head}`, `merge commit ${mergeSha}`],
  blockers: [],
  next_route: "treat PR merge completion as receipted only for this live head and merge commit SHA",
};

const sealed = routePostMergeContinuity({
  receipt,
  live_head_sha: head,
  merged_pr_state: "merged",
  observed_merge_commit_sha: mergeSha,
  continuity_receipt_id: "post-merge-continuity-001",
  spent_continuity_receipt_ids: [],
  required_followups: ["archive merged receipt", "stop PR branch mutation"],
});

assert.equal(sealed.ok, true);
assert.equal(sealed.action, "record_merged_manifestation");
assert.equal(sealed.merge_commit_sha, mergeSha);
assert.equal(
  sealed.next_route,
  "seal PR #2 as merged, stop branch-mutating finalization moves, and route future work through post-merge continuity followups",
);

const stale = routePostMergeContinuity({
  receipt,
  live_head_sha: "2222222222222222222222222222222222222222",
  merged_pr_state: "merged",
  observed_merge_commit_sha: mergeSha,
  continuity_receipt_id: "post-merge-continuity-002",
  spent_continuity_receipt_ids: [],
});

assert.equal(stale.ok, false);
assert.equal(stale.action, "block_stale_merge_receipt");
assert.deepEqual(stale.blockers, [
  `merge receipt head ${head} is not live head 2222222222222222222222222222222222222222`,
]);

const unmerged = routePostMergeContinuity({
  receipt,
  live_head_sha: head,
  merged_pr_state: "open",
  continuity_receipt_id: "post-merge-continuity-003",
  spent_continuity_receipt_ids: [],
});

assert.equal(unmerged.ok, false);
assert.equal(unmerged.action, "block_unmerged_pr_state");
assert.deepEqual(unmerged.blockers, ["PR state is open, not merged"]);

const replayed = routePostMergeContinuity({
  receipt,
  live_head_sha: head,
  merged_pr_state: "merged",
  continuity_receipt_id: "post-merge-continuity-001",
  spent_continuity_receipt_ids: ["post-merge-continuity-001"],
});

assert.equal(replayed.ok, false);
assert.equal(replayed.action, "block_replayed_continuity_receipt");
