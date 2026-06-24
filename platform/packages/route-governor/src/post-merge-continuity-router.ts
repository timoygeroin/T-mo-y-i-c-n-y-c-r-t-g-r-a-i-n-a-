import type { MergeResultReceipt } from "./merge-result-receipt.js";

export type PostMergePrState = "merged" | "open" | "closed_unmerged";

export type PostMergeContinuityAction =
  | "record_merged_manifestation"
  | "block_unmerged_receipt"
  | "block_stale_merge_receipt"
  | "block_unmerged_pr_state"
  | "block_merge_sha_mismatch"
  | "block_missing_continuity_receipt"
  | "block_replayed_continuity_receipt";

export interface PostMergeContinuityInput {
  receipt: MergeResultReceipt;
  live_head_sha: string;
  merged_pr_state: PostMergePrState;
  observed_merge_commit_sha?: string;
  continuity_receipt_id: string;
  spent_continuity_receipt_ids: string[];
  required_followups?: string[];
}

export interface PostMergeContinuityVerdict {
  ok: boolean;
  action: PostMergeContinuityAction;
  branch: string;
  head_sha: string;
  merge_commit_sha: string | null;
  continuity_receipt_id: string | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function base(input: PostMergeContinuityInput): Pick<PostMergeContinuityVerdict, "branch" | "head_sha"> {
  return {
    branch: input.receipt.branch,
    head_sha: input.receipt.head_sha,
  };
}

function block(
  input: PostMergeContinuityInput,
  action: Exclude<PostMergeContinuityAction, "record_merged_manifestation">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): PostMergeContinuityVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    merge_commit_sha: input.receipt.merge_commit_sha,
    continuity_receipt_id: null,
    decisive_evidence: [
      `merge receipt ${input.receipt.receipt_id ?? "<none>"}`,
      `receipt head ${input.receipt.head_sha}`,
      `live head ${input.live_head_sha}`,
      ...evidence,
    ],
    blockers,
    next_route: nextRoute,
  };
}

export function routePostMergeContinuity(input: PostMergeContinuityInput): PostMergeContinuityVerdict {
  if (!input.receipt.ok || input.receipt.action !== "compile_merge_result_receipt") {
    return block(
      input,
      "block_unmerged_receipt",
      [...input.receipt.blockers, `merge receipt action is ${input.receipt.action}`],
      "obtain a successful GitHub merge result receipt before sealing post-merge continuity",
    );
  }

  if (input.receipt.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_merge_receipt",
      [`merge receipt head ${input.receipt.head_sha} is not live head ${input.live_head_sha}`],
      "discard the stale merge receipt and read the live merged PR state before sealing continuity",
    );
  }

  if (input.merged_pr_state !== "merged") {
    return block(
      input,
      "block_unmerged_pr_state",
      [`PR state is ${input.merged_pr_state}, not merged`],
      "do not seal PR #2 as merged until GitHub reports the pull request merged",
      [`PR state ${input.merged_pr_state}`],
    );
  }

  const observedMergeSha = input.observed_merge_commit_sha?.trim();
  if (observedMergeSha && observedMergeSha !== input.receipt.merge_commit_sha) {
    return block(
      input,
      "block_merge_sha_mismatch",
      [`observed merge commit ${observedMergeSha} does not match receipt ${input.receipt.merge_commit_sha}`],
      "resolve the merge commit mismatch before post-merge continuity is recorded",
      [`observed merge commit ${observedMergeSha}`],
    );
  }

  const continuityReceiptId = input.continuity_receipt_id.trim();
  if (!continuityReceiptId) {
    return block(
      input,
      "block_missing_continuity_receipt",
      ["post-merge continuity receipt has no id"],
      "compile post-merge continuity with a durable receipt id",
    );
  }

  if (input.spent_continuity_receipt_ids.includes(continuityReceiptId)) {
    return block(
      input,
      "block_replayed_continuity_receipt",
      [`post-merge continuity receipt already spent: ${continuityReceiptId}`],
      "do not replay an already spent post-merge continuity receipt",
    );
  }

  const followups = input.required_followups ?? [];
  const mergeSha = input.receipt.merge_commit_sha ?? observedMergeSha ?? null;

  return {
    ...base(input),
    ok: true,
    action: "record_merged_manifestation",
    merge_commit_sha: mergeSha,
    continuity_receipt_id: continuityReceiptId,
    decisive_evidence: [
      `merge receipt ${input.receipt.receipt_id}`,
      `continuity receipt ${continuityReceiptId}`,
      `live head ${input.live_head_sha}`,
      `merge commit ${mergeSha}`,
      ...followups.map((followup) => `followup:${followup}`),
    ],
    blockers: [],
    next_route:
      "seal PR #2 as merged, stop branch-mutating finalization moves, and route future work through post-merge continuity followups",
  };
}
