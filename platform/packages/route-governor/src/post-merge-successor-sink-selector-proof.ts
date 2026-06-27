import { closeMergedPrSink, type PostMergeSinkClosureInput } from "./post-merge-sink-closure.js";
import {
  selectPostMergeSuccessorSink,
  type PostMergeSuccessorCandidate,
  type PostMergeSuccessorSinkSelectorInput,
} from "./post-merge-successor-sink-selector.js";

function closureInput(overrides: Partial<PostMergeSinkClosureInput> = {}): PostMergeSinkClosureInput {
  return {
    closure_id: "post-merge-pr-2-closure-001",
    spent_closure_ids: [],
    active_pr_number: 2,
    active_branch: "monday-platform-genesis-01",
    previous_active_head_sha: "4fbd48ca4539986c874f85394188c405b8d25600",
    observed_pr: {
      pr_number: 2,
      state: "closed",
      merged: true,
      draft: false,
      head_branch: "monday-platform-genesis-01",
      head_sha: "4fbd48ca4539986c874f85394188c405b8d25600",
      merge_commit_sha: "744387e081b4126ddba74d03ee11588e76ed3789",
    },
    ...overrides,
  };
}

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
    routing_artifacts: ["post-merge successor sink selector prevents PR #2 reuse"],
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

function expectAction(name: string, inputValue: PostMergeSuccessorSinkSelectorInput, action: string, ok: boolean): void {
  const verdict = selectPostMergeSuccessorSink(inputValue);
  if (verdict.action !== action || verdict.ok !== ok) {
    throw new Error(`${name} expected ${action}/${ok}, got ${verdict.action}/${verdict.ok}: ${verdict.blockers.join("; ")}`);
  }
}

function expectClosureAction(name: string, inputValue: PostMergeSinkClosureInput, action: string, ok: boolean): void {
  const verdict = closeMergedPrSink(inputValue);
  if (verdict.action !== action || verdict.ok !== ok) {
    throw new Error(`${name} expected ${action}/${ok}, got ${verdict.action}/${verdict.ok}: ${verdict.blockers.join("; ")}`);
  }
}

export function runPostMergeSuccessorSinkSelectorProof(): void {
  expectClosureAction("merged closed PR sink is sealed", closureInput(), "seal_merged_pr_sink", true);

  expectClosureAction(
    "moved post-merge head requires readback first",
    closureInput({
      observed_pr: {
        ...closureInput().observed_pr,
        head_sha: "next-head",
      },
    }),
    "route_to_moved_head_readback",
    false,
  );

  expectClosureAction(
    "open PR cannot be sealed as merged",
    closureInput({
      observed_pr: {
        ...closureInput().observed_pr,
        state: "open",
        merged: false,
        merge_commit_sha: null,
      },
    }),
    "block_unmerged_sink",
    false,
  );

  expectClosureAction(
    "missing merge commit is external blocker",
    closureInput({
      observed_pr: {
        ...closureInput().observed_pr,
        merge_commit_sha: null,
      },
    }),
    "block_missing_merge_commit",
    false,
  );

  expectClosureAction(
    "closure ids cannot be reused",
    closureInput({ spent_closure_ids: ["post-merge-pr-2-closure-001"] }),
    "block_reused_closure",
    false,
  );

  expectAction("open successor PR wins", input(), "select_new_pull_request_sink", true);

  expectAction(
    "successor branch admitted before PR-surface claim",
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
    "select_successor_branch_sink",
    true,
  );

  expectAction(
    "merge receipt can only seal the consumed surface",
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
      ],
    }),
    "seal_merge_receipt_only",
    true,
  );

  expectAction(
    "merged PR reuse is blocked",
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
      ],
    }),
    "block_no_successor_sink",
    false,
  );

  expectAction(
    "exact blocker is terminal but not progress",
    input({
      candidates: [
        candidate({
          candidate_id: "exact-blocker",
          kind: "exact_external_blocker",
          pr_number: undefined,
          pr_state: undefined,
          executable_delta_files: [],
          routing_artifacts: [],
          blocker: "successor sink creation is unavailable",
        }),
      ],
    }),
    "select_exact_external_blocker",
    false,
  );
}

runPostMergeSuccessorSinkSelectorProof();
