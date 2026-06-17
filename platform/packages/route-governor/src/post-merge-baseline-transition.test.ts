import assert from "node:assert/strict";

import { admitPostMergeBaselineTransition } from "./post-merge-baseline-transition.js";
import type { MergeResultReceipt } from "./merge-result-receipt.js";

const head = "2e3fc66fdcda13d660393ed98dd9b473e75e5608";
const mergeCommit = "68b54a6ab04267d98c5bfa4f54b32e2d705b7ce0";

function receipt(overrides: Partial<MergeResultReceipt> = {}): MergeResultReceipt {
  return {
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
    ...overrides,
  };
}

test("admits a live-head merge receipt into baseline continuation", () => {
  const verdict = admitPostMergeBaselineTransition({
    transition_id: `baseline-transition-pr-2:${head}`,
    spent_transition_ids: [],
    receipt: receipt(),
    live_head_sha: head,
    active_branch: "monday-platform-genesis-01",
    merged_baseline_branch: "main",
  });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_merged_baseline_transition");
  assert.equal(verdict.merge_commit_sha, mergeCommit);
  assert.equal(verdict.baseline_branch, "main");
});

test("blocks unmerged receipts before baseline transfer", () => {
  const verdict = admitPostMergeBaselineTransition({
    transition_id: `baseline-transition-pr-2:${head}`,
    spent_transition_ids: [],
    receipt: receipt({
      ok: false,
      action: "block_unmerged_result",
      merge_commit_sha: null,
      blockers: ["status 405: Pull request is not mergeable"],
    }),
    live_head_sha: head,
    active_branch: "monday-platform-genesis-01",
    merged_baseline_branch: "main",
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_unmerged_receipt");
  assert.deepEqual(verdict.blockers, [
    "status 405: Pull request is not mergeable",
    "merge receipt action is block_unmerged_result",
  ]);
});

test("blocks stale merge receipts", () => {
  const verdict = admitPostMergeBaselineTransition({
    transition_id: `baseline-transition-pr-2:${head}`,
    spent_transition_ids: [],
    receipt: receipt({ head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }),
    live_head_sha: head,
    active_branch: "monday-platform-genesis-01",
    merged_baseline_branch: "main",
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_merge_head");
});

test("blocks replayed post-merge transitions", () => {
  const transitionId = `baseline-transition-pr-2:${head}`;
  const verdict = admitPostMergeBaselineTransition({
    transition_id: transitionId,
    spent_transition_ids: [transitionId],
    receipt: receipt(),
    live_head_sha: head,
    active_branch: "monday-platform-genesis-01",
    merged_baseline_branch: "main",
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_replayed_transition");
});
