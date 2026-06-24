import type { MergeResultReceipt } from "./merge-result-receipt.js";

export type PostMergeBaselineTransitionAction =
  | "admit_merged_baseline_transition"
  | "block_unmerged_receipt"
  | "block_stale_merge_head"
  | "block_missing_merge_commit"
  | "block_same_branch_baseline"
  | "block_missing_transition_id"
  | "block_replayed_transition";

export interface PostMergeBaselineTransitionInput {
  transition_id: string;
  spent_transition_ids: string[];
  receipt: MergeResultReceipt;
  live_head_sha: string;
  active_branch: string;
  merged_baseline_branch: string;
}

export interface PostMergeBaselineTransitionVerdict {
  ok: boolean;
  action: PostMergeBaselineTransitionAction;
  transition_id: string | null;
  repository_full_name: string;
  pr_number: number;
  source_branch: string;
  baseline_branch: string;
  head_sha: string;
  merge_commit_sha: string | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function evidence(input: PostMergeBaselineTransitionInput): string[] {
  return [
    `transition ${input.transition_id || "<none>"}`,
    `receipt action ${input.receipt.action}`,
    `receipt head ${input.receipt.head_sha}`,
    `live head ${input.live_head_sha}`,
    `source branch ${input.active_branch}`,
    `baseline branch ${input.merged_baseline_branch}`,
  ];
}

function base(input: PostMergeBaselineTransitionInput): Pick<
  PostMergeBaselineTransitionVerdict,
  "repository_full_name" | "pr_number" | "source_branch" | "baseline_branch" | "head_sha" | "merge_commit_sha"
> {
  return {
    repository_full_name: input.receipt.repository_full_name,
    pr_number: input.receipt.pr_number,
    source_branch: input.active_branch,
    baseline_branch: input.merged_baseline_branch,
    head_sha: input.live_head_sha,
    merge_commit_sha: input.receipt.merge_commit_sha,
  };
}

function block(
  input: PostMergeBaselineTransitionInput,
  action: Exclude<PostMergeBaselineTransitionAction, "admit_merged_baseline_transition">,
  blockers: string[],
  nextRoute: string,
  decisiveEvidence: string[] = evidence(input),
): PostMergeBaselineTransitionVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    transition_id: null,
    decisive_evidence: decisiveEvidence,
    blockers,
    next_route: nextRoute,
  };
}

export function admitPostMergeBaselineTransition(
  input: PostMergeBaselineTransitionInput,
): PostMergeBaselineTransitionVerdict {
  const transitionId = input.transition_id.trim();
  if (!transitionId) {
    return block(
      input,
      "block_missing_transition_id",
      ["post-merge baseline transition has no transition id"],
      "compile the post-merge transition with a durable transition id before release",
    );
  }

  if (input.spent_transition_ids.includes(transitionId)) {
    return block(
      input,
      "block_replayed_transition",
      [`post-merge baseline transition already spent: ${transitionId}`],
      "do not reissue a baseline transition for an already receipted merge",
    );
  }

  if (input.active_branch === input.merged_baseline_branch) {
    return block(
      input,
      "block_same_branch_baseline",
      ["merged baseline branch must differ from the PR embodiment branch"],
      "name the repository baseline branch that received the merge commit",
    );
  }

  if (!input.receipt.ok || input.receipt.action !== "compile_merge_result_receipt") {
    return block(
      input,
      "block_unmerged_receipt",
      [...input.receipt.blockers, `merge receipt action is ${input.receipt.action}`],
      "obtain a successful GitHub merge result receipt before transferring continuation to baseline",
    );
  }

  if (input.receipt.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_merge_head",
      [`merge receipt head ${input.receipt.head_sha} is not live head ${input.live_head_sha}`],
      "discard stale merge receipt and re-enter from the live PR head",
    );
  }

  const mergeCommitSha = input.receipt.merge_commit_sha?.trim();
  if (!mergeCommitSha) {
    return block(
      input,
      "block_missing_merge_commit",
      ["merge receipt has no merge commit SHA"],
      "read the GitHub merge result again or emit the exact missing-merge-sha blocker",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_merged_baseline_transition",
    transition_id: transitionId,
    merge_commit_sha: mergeCommitSha,
    decisive_evidence: [
      ...evidence(input),
      `merge commit ${mergeCommitSha}`,
      `receipt ${input.receipt.receipt_id ?? "<none>"}`,
      transitionId,
    ],
    blockers: [],
    next_route:
      "treat the PR branch as completed only through this merge receipt, then continue future embodiment from the merged baseline branch",
  };
}
