import assert from "node:assert/strict";
import { test } from "node:test";

import type { MergeCommand } from "./merge-command-admission.js";
import { compileMergeCommandResultReceipt } from "./merge-command-result-receipt.js";

const head = "e6b5b11516615e75d18472281ea3449a14588ee2";
const mergeCommit = "1111111111111111111111111111111111111111";

const command: MergeCommand = {
  command_id: "merge-command-live-head",
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

function receipt(overrides = {}) {
  return compileMergeCommandResultReceipt({
    command,
    live_head_sha: head,
    receipt_id: "merge-result-live-head",
    spent_receipt_ids: [],
    api_result: {
      ok: true,
      merged: true,
      merge_commit_sha: mergeCommit,
    },
    ...overrides,
  });
}

test("compiles a successful GitHub merge result receipt", () => {
  const verdict = receipt();

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "compile_merge_result_receipt");
  assert.equal(verdict.merge_commit_sha, mergeCommit);
  assert.deepEqual(verdict.blockers, []);
  assert.match(verdict.next_route, /post-merge closeout/);
});

test("blocks stale merge commands when the PR head moved before the result", () => {
  const verdict = receipt({ live_head_sha: "2222222222222222222222222222222222222222" });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_merge_command");
  assert.deepEqual(verdict.blockers, [`merge command expected head ${head} is not live head 2222222222222222222222222222222222222222`]);
});

test("blocks replayed merge result receipt ids", () => {
  const verdict = receipt({ spent_receipt_ids: ["merge-result-live-head"] });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_replayed_merge_result");
  assert.deepEqual(verdict.blockers, ["merge result receipt already spent: merge-result-live-head"]);
});

test("blocks merge results that report a different observed head", () => {
  const observed = "3333333333333333333333333333333333333333";
  const verdict = receipt({
    api_result: {
      ok: false,
      merged: false,
      observed_head_sha: observed,
      status_code: 409,
      error: "Head branch was updated",
    },
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_merge_head_moved");
  assert.deepEqual(verdict.blockers, [`GitHub observed head ${observed}, not expected head ${head}`]);
});

test("emits exact external blocker for rejected GitHub merge results", () => {
  const verdict = receipt({
    api_result: {
      ok: false,
      merged: false,
      status_code: 405,
      error: "Required status check is expected",
    },
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "emit_merge_external_blocker");
  assert.deepEqual(verdict.blockers, ["status 405: Required status check is expected"]);
  assert.match(verdict.next_route, /GitHub merge blocker/);
});

test("blocks merged results that have no merge commit sha", () => {
  const verdict = receipt({ api_result: { ok: true, merged: true } });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "emit_merge_external_blocker");
  assert.deepEqual(verdict.blockers, ["GitHub reported merged without a merge commit sha"]);
});
