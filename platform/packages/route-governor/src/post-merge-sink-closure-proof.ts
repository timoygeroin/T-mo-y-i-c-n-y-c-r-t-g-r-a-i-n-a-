import { closeMergedPrSink, type PostMergeSinkClosureInput } from "./post-merge-sink-closure.js";

function input(overrides: Partial<PostMergeSinkClosureInput> = {}): PostMergeSinkClosureInput {
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

function expectAction(name: string, inputValue: PostMergeSinkClosureInput, action: string, ok: boolean): void {
  const verdict = closeMergedPrSink(inputValue);
  if (verdict.action !== action || verdict.ok !== ok) {
    throw new Error(`${name} expected ${action}/${ok}, got ${verdict.action}/${verdict.ok}: ${verdict.blockers.join("; ")}`);
  }
}

export function runPostMergeSinkClosureProof(): void {
  expectAction("merged closed PR sink is sealed", input(), "seal_merged_pr_sink", true);

  expectAction(
    "moved post-merge head requires readback first",
    input({
      observed_pr: {
        ...input().observed_pr,
        head_sha: "next-head",
      },
    }),
    "route_to_moved_head_readback",
    false,
  );

  expectAction(
    "open PR cannot be sealed as merged",
    input({
      observed_pr: {
        ...input().observed_pr,
        state: "open",
        merged: false,
        merge_commit_sha: null,
      },
    }),
    "block_unmerged_sink",
    false,
  );

  expectAction(
    "missing merge commit is external blocker",
    input({
      observed_pr: {
        ...input().observed_pr,
        merge_commit_sha: null,
      },
    }),
    "block_missing_merge_commit",
    false,
  );

  expectAction(
    "closure ids cannot be reused",
    input({ spent_closure_ids: ["post-merge-pr-2-closure-001"] }),
    "block_reused_closure",
    false,
  );
}

runPostMergeSinkClosureProof();
