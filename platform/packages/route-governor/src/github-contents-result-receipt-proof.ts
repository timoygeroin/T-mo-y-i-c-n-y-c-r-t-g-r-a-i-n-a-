import assert from "node:assert/strict";

import {
  compileGithubContentsResultReceipt,
  type GithubContentsResultReceiptInput,
  type GithubContentsWriteResult,
} from "./github-contents-result-receipt.js";
import type { GithubContentsExecutorVerdict } from "./github-contents-executor.js";

const repository = "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-";
const pr = 2;
const branch = "monday-platform-genesis-01";
const before = "ca4887cca455ba57fd9edf7a044af2eb380edcbe";
const firstCommit = "080eeba844b8cdc5769cbd70fea34ec38d9c0c06";
const finalCommit = "result-receipt-final-head";

function executor(overrides: Partial<GithubContentsExecutorVerdict> = {}): GithubContentsExecutorVerdict {
  return {
    ok: true,
    action: "execute_github_contents_writes",
    repository_full_name: repository,
    pr_number: pr,
    branch,
    head_sha: before,
    executor_plan_id: "github-contents-result-receipt",
    operations: [
      {
        mutation_id: "result-receipt-source",
        method: "create_file",
        repository_full_name: repository,
        branch,
        expected_head_sha: before,
        path: "platform/packages/route-governor/src/github-contents-result-receipt.ts",
        commit_message: "Add GitHub contents result receipt route",
        content_source: "connector create_file payload",
      },
      {
        mutation_id: "proof-wiring",
        method: "update_file",
        repository_full_name: repository,
        branch,
        expected_head_sha: firstCommit,
        path: "platform/packages/route-governor/package.json",
        commit_message: "Wire GitHub contents result receipt proof",
        content_source: "package export and proof script wiring",
        current_blob_sha: "package-json-sha",
      },
    ],
    decisive_evidence: ["github-contents-result-receipt", "write_branch", "github_contents_update_file"],
    blockers: [],
    next_route: "execute the GitHub contents operations, then read the moved PR head status surface",
    ...overrides,
  };
}

function result(overrides: Partial<GithubContentsWriteResult> = {}): GithubContentsWriteResult {
  return {
    mutation_id: "result-receipt-source",
    path: "platform/packages/route-governor/src/github-contents-result-receipt.ts",
    commit_sha: firstCommit,
    ...overrides,
  };
}

function input(overrides: Partial<GithubContentsResultReceiptInput> = {}): GithubContentsResultReceiptInput {
  return {
    executor: executor(),
    active_branch: branch,
    pre_write_head_sha: before,
    final_head_sha: finalCommit,
    write_results: [
      result(),
      result({
        mutation_id: "proof-wiring",
        path: "platform/packages/route-governor/package.json",
        commit_sha: finalCommit,
      }),
    ],
    ...overrides,
  };
}

const accepted = compileGithubContentsResultReceipt(input());
assert.equal(accepted.ok, true);
assert.equal(accepted.action, "accept_contents_result_receipt");
assert.equal(accepted.required_status_head_sha, finalCommit);
assert.match(accepted.next_route, /final GitHub contents commit/);
assert(accepted.decisive_evidence.includes(`head moved from ${before} to ${finalCommit}`));

const nonWritable = compileGithubContentsResultReceipt(
  input({ executor: executor({ action: "publish_without_contents_write", operations: [] }) }),
);
assert.equal(nonWritable.ok, false);
assert.equal(nonWritable.action, "block_executor_not_writable");

const staleExecutorHead = compileGithubContentsResultReceipt(input({ pre_write_head_sha: "newer-live-head" }));
assert.equal(staleExecutorHead.ok, false);
assert.deepEqual(staleExecutorHead.blockers, [
  `executor expected head ${before} does not match pre-write head newer-live-head`,
]);

const missingResult = compileGithubContentsResultReceipt(input({ write_results: [result()] }));
assert.equal(missingResult.ok, false);
assert.equal(missingResult.action, "block_missing_write_result");
assert.deepEqual(missingResult.blockers, [
  "missing GitHub contents write result for proof-wiring:platform/packages/route-governor/package.json",
]);

const unplannedResult = compileGithubContentsResultReceipt(
  input({
    write_results: [
      result(),
      result({
        mutation_id: "proof-wiring",
        path: "platform/packages/route-governor/package.json",
        commit_sha: finalCommit,
      }),
      result({ mutation_id: "unplanned", path: "platform/packages/route-governor/src/unplanned.ts" }),
    ],
  }),
);
assert.equal(unplannedResult.ok, false);
assert.equal(unplannedResult.action, "block_unmatched_write_result");

const unmovedHead = compileGithubContentsResultReceipt(
  input({
    final_head_sha: before,
    write_results: [
      result(),
      result({
        mutation_id: "proof-wiring",
        path: "platform/packages/route-governor/package.json",
        commit_sha: before,
      }),
    ],
  }),
);
assert.equal(unmovedHead.ok, false);
assert.equal(unmovedHead.action, "block_unmoved_head");

const finalMismatch = compileGithubContentsResultReceipt(input({ final_head_sha: "different-final-head" }));
assert.equal(finalMismatch.ok, false);
assert.equal(finalMismatch.action, "block_unmatched_write_result");
assert.deepEqual(finalMismatch.blockers, [`final write result ${finalCommit} does not match final head different-final-head`]);

console.log("github contents result receipt proof passed");
