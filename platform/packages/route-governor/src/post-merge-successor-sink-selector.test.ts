import assert from "node:assert/strict";
import test from "node:test";

import {
  selectPostMergeSuccessorSink,
  type PostMergeSuccessorCandidate,
  type PostMergeSuccessorSinkSelectorInput,
} from "./post-merge-successor-sink-selector.js";

function candidate(overrides: Partial<PostMergeSuccessorCandidate> = {}): PostMergeSuccessorCandidate {
  return {
    candidate_id: "successor-pr-3",
    kind: "new_pull_request",
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    branch: "monday-platform-genesis-02",
    head_sha: "successor-head",
    pr_number: 3,
    pr_state: "open",
    executable_delta_files: ["platform/packages/route-governor/src/post-merge-successor-sink-selector.ts"],
    routing_artifacts: ["post-merge selector prevents PR #2 reuse after merge"],
    ...overrides,
  };
}

function input(overrides: Partial<PostMergeSuccessorSinkSelectorInput> = {}): PostMergeSuccessorSinkSelectorInput {
  return {
    merged_pr_number: 2,
    merged_branch: "monday-platform-genesis-01",
    merged_head_sha: "4fbd48ca4539986c874f85394188c405b8d25600",
    merge_commit_sha: "744387e081b4126ddba74d03ee11588e76ed3789",
    spent_candidate_ids: [],
    candidates: [candidate()],
    ...overrides,
  };
}

test("selects an open successor PR over lower-grade post-merge surfaces", () => {
  const verdict = selectPostMergeSuccessorSink(
    input({
      candidates: [
        candidate({
          candidate_id: "merge-receipt",
          kind: "merge_receipt_only",
          branch: "main",
          head_sha: "744387e081b4126ddba74d03ee11588e76ed3789",
          pr_number: undefined,
          pr_state: undefined,
          executable_delta_files: [],
          routing_artifacts: [],
        }),
        candidate(),
      ],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "select_new_pull_request_sink");
  assert.equal(verdict.selected?.candidate_id, "successor-pr-3");
  assert.equal(verdict.selected?.pr_number, 3);
});

test("selects a distinct successor branch when no open successor PR exists", () => {
  const verdict = selectPostMergeSuccessorSink(
    input({
      candidates: [
        candidate({
          candidate_id: "successor-branch",
          kind: "successor_branch",
          branch: "monday-platform-genesis-02",
          head_sha: "successor-head",
          pr_number: undefined,
          pr_state: undefined,
        }),
      ],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "select_successor_branch_sink");
  assert.equal(verdict.next_route, "open a successor PR for the selected branch before claiming PR-surface progress");
});

test("rejects reuse of the consumed merged PR and status-comment progress", () => {
  const verdict = selectPostMergeSuccessorSink(
    input({
      candidates: [
        candidate({
          candidate_id: "reuse-pr-2",
          kind: "reuse_merged_pr",
          branch: "monday-platform-genesis-01",
          head_sha: "4fbd48ca4539986c874f85394188c405b8d25600",
          pr_number: 2,
          pr_state: "closed",
        }),
        candidate({
          candidate_id: "status-comment",
          kind: "status_comment",
          branch: "monday-platform-genesis-01",
          head_sha: "4fbd48ca4539986c874f85394188c405b8d25600",
          pr_number: 2,
          pr_state: "closed",
          executable_delta_files: [],
          routing_artifacts: [],
        }),
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_no_successor_sink");
  assert.ok(verdict.rejected.some((entry) => entry.reasons.some((reason) => reason.includes("cannot be reused"))));
  assert.ok(verdict.rejected.some((entry) => entry.reasons.includes("status comments on a merged PR are non-progress after merge completion")));
});

test("rejects successor surfaces without executable routing deltas", () => {
  const verdict = selectPostMergeSuccessorSink(
    input({
      candidates: [
        candidate({ executable_delta_files: [], routing_artifacts: [] }),
        candidate({
          candidate_id: "same-head-successor",
          kind: "successor_branch",
          branch: "monday-platform-genesis-01",
          head_sha: "4fbd48ca4539986c874f85394188c405b8d25600",
          pr_number: undefined,
          pr_state: undefined,
        }),
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.ok(verdict.rejected.some((entry) => entry.reasons.includes("new pull request sink has no executable platform delta")));
  assert.ok(verdict.rejected.some((entry) => entry.reasons.includes("candidate reuses the merged PR branch head without a successor surface")));
});

test("admits one exact external blocker when no successor surface is possible", () => {
  const blocker = "GitHub branch creation for monday-platform-genesis-02 is unavailable to this run";
  const verdict = selectPostMergeSuccessorSink(
    input({
      candidates: [
        candidate({
          candidate_id: "exact-blocker",
          kind: "exact_external_blocker",
          branch: "monday-platform-genesis-01",
          head_sha: "4fbd48ca4539986c874f85394188c405b8d25600",
          pr_number: undefined,
          pr_state: undefined,
          executable_delta_files: [],
          routing_artifacts: [],
          blocker,
        }),
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "select_exact_external_blocker");
  assert.ok(verdict.blockers.includes(blocker));
});
