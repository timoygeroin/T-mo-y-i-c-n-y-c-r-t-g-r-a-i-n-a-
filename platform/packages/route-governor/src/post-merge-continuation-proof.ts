import assert from "node:assert/strict";

import { routePostMergeContinuation, type PostMergeContinuationInput } from "./post-merge-continuation.js";
import type { MergeResultReceipt } from "./merge-result-receipt.js";

const repo = "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-";
const branch = "monday-platform-genesis-01";
const head = "2846e244d89d7297ecf1f201e4a941f130eb7123";
const mergeSha = "e668699054950f4172266dbfed44673e15f6d127";
const receiptId = `merge-result-pr-2:${head}`;

function receipt(overrides: Partial<MergeResultReceipt> = {}): MergeResultReceipt {
  return {
    ok: true,
    action: "compile_merge_result_receipt",
    receipt_id: receiptId,
    operation: "merge_pull_request",
    repository_full_name: repo,
    pr_number: 2,
    branch,
    head_sha: head,
    merge_method: "squash",
    merge_commit_sha: mergeSha,
    decisive_evidence: [`receipt ${receiptId}`, `live head ${head}`, `merge commit ${mergeSha}`],
    blockers: [],
    next_route: "treat PR merge completion as receipted only for this live head and merge commit SHA",
    ...overrides,
  };
}

function input(overrides: Partial<PostMergeContinuationInput> = {}): PostMergeContinuationInput {
  return {
    receipt: receipt(),
    expected_repository_full_name: repo,
    expected_pr_number: 2,
    expected_branch: branch,
    expected_head_sha: head,
    spent_receipt_ids: [],
    followup: {
      artifact_path: "platform/packages/route-governor/src/post-merge-continuation.ts",
      executable_artifact: "routePostMergeContinuation",
      routing_artifact: "post-merge continuation router",
      route_gain: "merged PR completion becomes a starting point for the next platform route instead of a terminal slogan",
    },
    ...overrides,
  };
}

const admitted = routePostMergeContinuation(input());
assert.equal(admitted.ok, true);
assert.equal(admitted.action, "admit_post_merge_platform_continuation");
assert.equal(admitted.merge_commit_sha, mergeSha);
assert(admitted.decisive_evidence.some((evidence) => evidence.includes("next executable artifact")));

const unmerged = routePostMergeContinuation(
  input({
    receipt: receipt({
      ok: false,
      action: "block_unmerged_result",
      receipt_id: null,
      merge_commit_sha: null,
      blockers: ["status 405: Pull request is not mergeable"],
    }),
  }),
);
assert.equal(unmerged.ok, false);
assert.equal(unmerged.action, "block_unmerged_receipt");
assert.deepEqual(unmerged.blockers, ["status 405: Pull request is not mergeable"]);

const stale = routePostMergeContinuation(input({ expected_head_sha: "newer-live-head" }));
assert.equal(stale.ok, false);
assert.equal(stale.action, "block_stale_merge_receipt");

const replay = routePostMergeContinuation(input({ spent_receipt_ids: [receiptId] }));
assert.equal(replay.ok, false);
assert.equal(replay.action, "block_replayed_merge_receipt");

const missingFollowup = routePostMergeContinuation(
  input({
    followup: {
      artifact_path: "docs/post-merge-note.md",
      executable_artifact: "",
      routing_artifact: "",
      route_gain: "",
    },
  }),
);
assert.equal(missingFollowup.ok, false);
assert.equal(missingFollowup.action, "block_missing_followup_artifact");
assert(missingFollowup.blockers.some((blocker) => blocker.includes("not an executable platform artifact")));

console.log("post-merge continuation proof passed");
