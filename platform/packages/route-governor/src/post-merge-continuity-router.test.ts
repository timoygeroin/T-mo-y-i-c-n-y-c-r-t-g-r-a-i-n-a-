import test from "node:test";
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

test("records post-merge continuity only for merged live-head receipts", () => {
  const verdict = routePostMergeContinuity({
    receipt,
    live_head_sha: head,
    merged_pr_state: "merged",
    observed_merge_commit_sha: mergeSha,
    continuity_receipt_id: "post-merge-continuity-001",
    spent_continuity_receipt_ids: [],
    required_followups: ["archive merged receipt", "stop PR branch mutation"],
  });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "record_merged_manifestation");
  assert.equal(verdict.merge_commit_sha, mergeSha);
  assert.deepEqual(verdict.blockers, []);
});

test("blocks stale merge receipts", () => {
  const verdict = routePostMergeContinuity({
    receipt,
    live_head_sha: "2222222222222222222222222222222222222222",
    merged_pr_state: "merged",
    observed_merge_commit_sha: mergeSha,
    continuity_receipt_id: "post-merge-continuity-002",
    spent_continuity_receipt_ids: [],
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_merge_receipt");
});

test("blocks open PR state before sealing continuity", () => {
  const verdict = routePostMergeContinuity({
    receipt,
    live_head_sha: head,
    merged_pr_state: "open",
    continuity_receipt_id: "post-merge-continuity-003",
    spent_continuity_receipt_ids: [],
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_unmerged_pr_state");
  assert.deepEqual(verdict.blockers, ["PR state is open, not merged"]);
});

test("blocks replayed post-merge continuity receipts", () => {
  const verdict = routePostMergeContinuity({
    receipt,
    live_head_sha: head,
    merged_pr_state: "merged",
    continuity_receipt_id: "post-merge-continuity-001",
    spent_continuity_receipt_ids: ["post-merge-continuity-001"],
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_replayed_continuity_receipt");
});
