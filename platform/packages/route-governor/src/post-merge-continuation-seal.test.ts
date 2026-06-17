import assert from "node:assert/strict";
import test from "node:test";

import { compilePostMergeContinuationSeal } from "./post-merge-continuation-seal.js";
import type { MergeResultReceipt } from "./merge-result-receipt.js";

const head = "98d7faf8b336379ff3ddc12e135b8267c623e8d2";
const mergeCommit = "5b00955e139b33a72a40986f1faa12d6700427ed";

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

test("seals a successful merge receipt and retires the PR branch continuation surface", () => {
  const verdict = compilePostMergeContinuationSeal({
    receipt: receipt(),
    live_head_sha: head,
    expected_branch: "monday-platform-genesis-01",
    seal_id: `post-merge-seal-pr-2:${mergeCommit}`,
    spent_seal_ids: [],
    requested_next_move: "seal_manifestation_cycle",
  });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "seal_external_manifestation");
  assert.equal(verdict.merge_commit_sha, mergeCommit);
  assert.ok(verdict.retired_surfaces.includes(`pr-branch:monday-platform-genesis-01`));
  assert.equal(verdict.next_route, "stop PR-branch embodiment and continue only from the merged commit or a new external sink");
});

test("archives a successful merge receipt as the terminal external receipt", () => {
  const verdict = compilePostMergeContinuationSeal({
    receipt: receipt(),
    live_head_sha: head,
    expected_branch: "monday-platform-genesis-01",
    seal_id: `post-merge-archive-pr-2:${mergeCommit}`,
    spent_seal_ids: [],
    requested_next_move: "archive_merge_receipt",
  });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "archive_external_receipt");
  assert.ok(verdict.decisive_evidence.includes(`continue from merge commit ${mergeCommit}`));
});

test("blocks post-merge PR branch embodiment replay", () => {
  const verdict = compilePostMergeContinuationSeal({
    receipt: receipt(),
    live_head_sha: head,
    expected_branch: "monday-platform-genesis-01",
    seal_id: `post-merge-seal-pr-2:${mergeCommit}`,
    spent_seal_ids: [],
    requested_next_move: "continue_pr_embodiment",
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_post_merge_pr_continuation");
  assert.deepEqual(verdict.blockers, ["continue_pr_embodiment is invalid after a successful merge receipt"]);
});

test("blocks stale, unmerged, and replayed merge seals", () => {
  const stale = compilePostMergeContinuationSeal({
    receipt: receipt({ head_sha: "old-head" }),
    live_head_sha: head,
    expected_branch: "monday-platform-genesis-01",
    seal_id: `post-merge-seal-pr-2:${mergeCommit}`,
    spent_seal_ids: [],
    requested_next_move: "seal_manifestation_cycle",
  });
  assert.equal(stale.action, "block_stale_receipt_head");

  const unmerged = compilePostMergeContinuationSeal({
    receipt: receipt({
      ok: false,
      action: "block_unmerged_result",
      merge_commit_sha: null,
      blockers: ["status 405: Pull request is not mergeable"],
    }),
    live_head_sha: head,
    expected_branch: "monday-platform-genesis-01",
    seal_id: `post-merge-seal-pr-2:${mergeCommit}`,
    spent_seal_ids: [],
    requested_next_move: "seal_manifestation_cycle",
  });
  assert.equal(unmerged.action, "block_unmerged_receipt");

  const replayed = compilePostMergeContinuationSeal({
    receipt: receipt(),
    live_head_sha: head,
    expected_branch: "monday-platform-genesis-01",
    seal_id: `post-merge-seal-pr-2:${mergeCommit}`,
    spent_seal_ids: [`post-merge-seal-pr-2:${mergeCommit}`],
    requested_next_move: "seal_manifestation_cycle",
  });
  assert.equal(replayed.action, "block_replayed_seal");
});
