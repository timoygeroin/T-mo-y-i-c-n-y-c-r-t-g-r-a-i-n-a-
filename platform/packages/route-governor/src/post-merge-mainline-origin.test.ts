import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  compilePostMergeMainlineOrigin,
  type PostMergeMainlineOriginInput,
} from "./post-merge-mainline-origin.js";
import type { PostMergeContinuationVerdict } from "./post-merge-continuation.js";

const repo = "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-";
const prBranch = "monday-platform-genesis-01";
const defaultBranch = "main";
const head = "b50b5f86e2a01d3b8e40f244d50ec3ffb80a1bbd";
const mergeCommit = "fd8d821989540ff9e7f263d7e384a4418f6ff098";

function continuation(overrides: Partial<PostMergeContinuationVerdict> = {}): PostMergeContinuationVerdict {
  return {
    ok: true,
    action: "admit_post_merge_platform_continuation",
    repository_full_name: repo,
    pr_number: 2,
    branch: prBranch,
    head_sha: head,
    merge_commit_sha: mergeCommit,
    receipt_id: `merge-result-pr-2:${head}`,
    decisive_evidence: [`merged head ${head}`, `merge commit ${mergeCommit}`],
    blockers: [],
    next_route: "start the next platform route from the receipted merge commit",
    ...overrides,
  };
}

function input(overrides: Partial<PostMergeMainlineOriginInput> = {}): PostMergeMainlineOriginInput {
  return {
    continuation: continuation(),
    expected_head_sha: head,
    default_branch: defaultBranch,
    next_branch: "monday-platform-genesis-02",
    origin_id: `post-merge-origin-pr-2:${head}`,
    spent_origin_ids: [],
    ...overrides,
  };
}

describe("compilePostMergeMainlineOrigin", () => {
  it("compiles the next platform branch from the merge commit on main", () => {
    const verdict = compilePostMergeMainlineOrigin(input());

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "compile_next_mainline_origin");
    assert.equal(verdict.command?.operation, "create_branch");
    assert.equal(verdict.command?.base_ref, defaultBranch);
    assert.equal(verdict.command?.base_sha, mergeCommit);
    assert.equal(verdict.command?.branch, "monday-platform-genesis-02");
    assert.deepEqual(verdict.command?.guard.forbid_base_refs, [prBranch, head]);
  });

  it("blocks an unadmitted post-merge continuation", () => {
    const verdict = compilePostMergeMainlineOrigin(
      input({
        continuation: continuation({
          ok: false,
          action: "block_unmerged_receipt",
          merge_commit_sha: null,
          blockers: ["status 405: Pull request is not mergeable"],
        }),
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_unadmitted_post_merge");
    assert.deepEqual(verdict.blockers, ["status 405: Pull request is not mergeable"]);
  });

  it("blocks stale post-merge receipts", () => {
    const verdict = compilePostMergeMainlineOrigin(input({ expected_head_sha: "new-live-head" }));

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_stale_merge_head");
    assert(verdict.blockers.some((blocker) => blocker.includes(head)));
  });

  it("blocks continuing from the closed PR branch", () => {
    const verdict = compilePostMergeMainlineOrigin(input({ next_branch: prBranch }));

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_closed_pr_branch_origin");
  });

  it("blocks replayed post-merge origins", () => {
    const originId = `post-merge-origin-pr-2:${head}`;
    const verdict = compilePostMergeMainlineOrigin(input({ spent_origin_ids: [originId] }));

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_replayed_origin");
    assert(verdict.blockers.includes(`post-merge mainline origin already spent: ${originId}`));
  });
});
