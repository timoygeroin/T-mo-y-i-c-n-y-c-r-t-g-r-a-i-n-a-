import type { MergeResultReceipt } from "./merge-result-receipt.js";

export type PostMergeContinuationMove =
  | "seal_manifestation_cycle"
  | "archive_merge_receipt"
  | "continue_pr_embodiment"
  | "status_readback"
  | "duplicate_summary";

export type PostMergeContinuationSealAction =
  | "seal_external_manifestation"
  | "archive_external_receipt"
  | "block_unmerged_receipt"
  | "block_stale_receipt_head"
  | "block_branch_mismatch"
  | "block_missing_seal_id"
  | "block_replayed_seal"
  | "block_post_merge_pr_continuation"
  | "block_missing_merge_commit";

export interface PostMergeContinuationSealInput {
  receipt: MergeResultReceipt;
  live_head_sha: string;
  expected_branch: string;
  seal_id: string;
  spent_seal_ids: string[];
  requested_next_move: PostMergeContinuationMove;
}

export interface PostMergeContinuationSealVerdict {
  ok: boolean;
  action: PostMergeContinuationSealAction;
  seal_id: string | null;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  merge_commit_sha: string | null;
  decisive_evidence: string[];
  blockers: string[];
  retired_surfaces: string[];
  next_route: string;
}

function base(input: PostMergeContinuationSealInput): Pick<
  PostMergeContinuationSealVerdict,
  "repository_full_name" | "pr_number" | "branch" | "head_sha" | "merge_commit_sha" | "retired_surfaces"
> {
  return {
    repository_full_name: input.receipt.repository_full_name,
    pr_number: input.receipt.pr_number,
    branch: input.receipt.branch,
    head_sha: input.receipt.head_sha,
    merge_commit_sha: input.receipt.merge_commit_sha,
    retired_surfaces: [
      `pr-branch:${input.receipt.branch}`,
      `head:${input.receipt.head_sha}`,
      ...(input.receipt.merge_commit_sha ? [`merge-commit:${input.receipt.merge_commit_sha}`] : []),
    ],
  };
}

function block(
  input: PostMergeContinuationSealInput,
  action: Exclude<PostMergeContinuationSealAction, "seal_external_manifestation" | "archive_external_receipt">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): PostMergeContinuationSealVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    seal_id: null,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function receiptEvidence(receipt: MergeResultReceipt): string[] {
  return [
    `receipt ${receipt.receipt_id ?? "<none>"}`,
    `receipt action ${receipt.action}`,
    `head ${receipt.head_sha}`,
    ...(receipt.merge_commit_sha ? [`merge commit ${receipt.merge_commit_sha}`] : []),
  ];
}

export function compilePostMergeContinuationSeal(
  input: PostMergeContinuationSealInput,
): PostMergeContinuationSealVerdict {
  const evidence = receiptEvidence(input.receipt);

  if (!input.receipt.ok || input.receipt.action !== "compile_merge_result_receipt") {
    return block(
      input,
      "block_unmerged_receipt",
      [...input.receipt.blockers, `merge receipt action is ${input.receipt.action}`],
      "obtain a successful GitHub merge-result receipt before sealing post-merge continuation",
      evidence,
    );
  }

  if (input.receipt.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_receipt_head",
      [`merge receipt head ${input.receipt.head_sha} is not live head ${input.live_head_sha}`],
      "discard stale merge receipts and re-enter from the live PR head before post-merge sealing",
      evidence,
    );
  }

  if (input.receipt.branch !== input.expected_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`merge receipt branch ${input.receipt.branch} does not match expected branch ${input.expected_branch}`],
      "bind the post-merge seal to the active manifestation branch",
      evidence,
    );
  }

  if (!input.receipt.merge_commit_sha) {
    return block(
      input,
      "block_missing_merge_commit",
      ["successful merge receipt has no merge commit SHA"],
      "read the GitHub merge result again or emit the missing merge-commit blocker",
      evidence,
    );
  }

  const sealId = input.seal_id.trim();
  if (!sealId) {
    return block(
      input,
      "block_missing_seal_id",
      ["post-merge continuation seal has no seal id"],
      "compile post-merge seals with a durable seal id before retiring the PR branch surface",
      evidence,
    );
  }

  if (input.spent_seal_ids.includes(sealId)) {
    return block(
      input,
      "block_replayed_seal",
      [`post-merge continuation seal already spent: ${sealId}`],
      "do not replay a spent post-merge seal for the same merge result",
      evidence,
    );
  }

  if (input.requested_next_move === "continue_pr_embodiment" || input.requested_next_move === "status_readback") {
    return block(
      input,
      "block_post_merge_pr_continuation",
      [`${input.requested_next_move} is invalid after a successful merge receipt`],
      "retire the PR branch as the manifestation surface and continue from the merge commit or archive receipt",
      evidence,
    );
  }

  if (input.requested_next_move === "duplicate_summary") {
    return block(
      input,
      "block_post_merge_pr_continuation",
      ["duplicate post-merge summary is not terminal progress"],
      "archive the merge receipt or seal the manifestation cycle instead of summarizing it again",
      evidence,
    );
  }

  return {
    ...base(input),
    ok: true,
    action: input.requested_next_move === "archive_merge_receipt" ? "archive_external_receipt" : "seal_external_manifestation",
    seal_id: sealId,
    decisive_evidence: [
      ...evidence,
      `seal ${sealId}`,
      `retire branch ${input.receipt.branch}`,
      `continue from merge commit ${input.receipt.merge_commit_sha}`,
    ],
    blockers: [],
    next_route:
      input.requested_next_move === "archive_merge_receipt"
        ? "archive this merge receipt as the external manifestation terminal receipt"
        : "stop PR-branch embodiment and continue only from the merged commit or a new external sink",
  };
}
