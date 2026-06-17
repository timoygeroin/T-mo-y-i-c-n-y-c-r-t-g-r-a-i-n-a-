import assert from "node:assert/strict";

import { routePostMergeFinalization } from "./post-merge-finalization-router.js";
import type { MergeResultReceipt } from "./merge-result-receipt.js";

const head = "18eca77e642a2fa383d55fd8c7680b83dc1f4fc7";
const mergeSha = "1cf9e3fed61070aeb290a46c46036b492f047d07";

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
  merge_commit_sha: mergeSha,
  decisive_evidence: [`live head ${head}`, `merge commit ${mergeSha}`],
  blockers: [],
  next_route: "treat PR merge completion as receipted only for this live head and merge commit SHA",
};

const completed = routePostMergeFinalization({
  receipt,
  live_head_sha: head,
  completion_id: `post-merge-finalization-pr-2:${head}`,
  spent_completion_ids: [],
  pr_state_after_merge: "closed",
});

assert.equal(completed.ok, true);
assert.equal(completed.action, "complete_external_manifestation");
assert.equal(completed.merge_commit_sha, mergeSha);
assert.equal(
  completed.next_route,
  "preserve the merge completion receipt and stop adding embodiment increments to the merged PR branch",
);

const stale = routePostMergeFinalization({
  receipt,
  live_head_sha: "moved-head",
  completion_id: `post-merge-finalization-pr-2:moved-head`,
  spent_completion_ids: [],
});

assert.equal(stale.ok, false);
assert.equal(stale.action, "block_stale_merge_receipt");
assert.deepEqual(stale.blockers, [`merge receipt head ${head} is not live head moved-head`]);

const unmerged = routePostMergeFinalization({
  receipt: {
    ...receipt,
    ok: false,
    action: "block_unmerged_result",
    merge_commit_sha: null,
    blockers: ["status 405: Pull request is not mergeable"],
  },
  live_head_sha: head,
  completion_id: `post-merge-finalization-blocked-pr-2:${head}`,
  spent_completion_ids: [],
});

assert.equal(unmerged.ok, false);
assert.equal(unmerged.action, "route_to_merge_blocker");
assert.deepEqual(unmerged.blockers, [
  "status 405: Pull request is not mergeable",
  "merge result receipt action is block_unmerged_result, not compile_merge_result_receipt",
]);

const replayed = routePostMergeFinalization({
  receipt,
  live_head_sha: head,
  completion_id: `post-merge-finalization-pr-2:${head}`,
  spent_completion_ids: [`post-merge-finalization-pr-2:${head}`],
});

assert.equal(replayed.ok, false);
assert.equal(replayed.action, "block_replayed_completion");

console.log("post-merge finalization router proof passed");
