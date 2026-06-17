import type { MergeResultReceipt } from "./merge-result-receipt.js";

export type PostMergeFinalizationAction =
  | "complete_external_manifestation"
  | "route_to_merge_blocker"
  | "block_stale_merge_receipt"
  | "block_replayed_completion";

export interface PostMergeFinalizationInput {
  receipt: MergeResultReceipt;
  live_head_sha: string;
  completion_id: string;
  spent_completion_ids: string[];
  pr_state_after_merge?: "open" | "closed" | "merged" | "unknown";
}

export interface PostMergeFinalizationVerdict {
  ok: boolean;
  action: PostMergeFinalizationAction;
  completion_id: string | null;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  merge_commit_sha: string | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function base(input: PostMergeFinalizationInput): Pick<
  PostMergeFinalizationVerdict,
  "repository_full_name" | "pr_number" | "branch" | "head_sha" | "merge_commit_sha"
> {
  return {
    repository_full_name: input.receipt.repository_full_name,
    pr_number: input.receipt.pr_number,
    branch: input.receipt.branch,
    head_sha: input.receipt.head_sha,
    merge_commit_sha: input.receipt.merge_commit_sha,
  };
}

function evidence(input: PostMergeFinalizationInput): string[] {
  return [
    `receipt action ${input.receipt.action}`,
    `receipt id ${input.receipt.receipt_id ?? "<none>"}`,
    `receipt head ${input.receipt.head_sha}`,
    `live head ${input.live_head_sha}`,
    `merge commit ${input.receipt.merge_commit_sha ?? "<none>"}`,
  ];
}

function block(
  input: PostMergeFinalizationInput,
  action: Exclude<PostMergeFinalizationAction, "complete_external_manifestation">,
  blockers: string[],
  nextRoute: string,
): PostMergeFinalizationVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    completion_id: null,
    decisive_evidence: evidence(input),
    blockers,
    next_route: nextRoute,
  };
}

export function routePostMergeFinalization(input: PostMergeFinalizationInput): PostMergeFinalizationVerdict {
  if (input.receipt.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_merge_receipt",
      [`merge receipt head ${input.receipt.head_sha} is not live head ${input.live_head_sha}`],
      "discard the stale merge receipt and re-enter merge finalization from the live PR head",
    );
  }

  const completionId = input.completion_id.trim();
  if (!completionId || input.spent_completion_ids.includes(completionId)) {
    return block(
      input,
      "block_replayed_completion",
      [completionId ? `post-merge completion already spent: ${completionId}` : "post-merge completion has no id"],
      "compile a new durable completion id before counting post-merge finalization",
    );
  }

  if (!input.receipt.ok || input.receipt.action !== "compile_merge_result_receipt") {
    return block(
      input,
      "route_to_merge_blocker",
      [
        ...input.receipt.blockers,
        `merge result receipt action is ${input.receipt.action}, not compile_merge_result_receipt`,
      ],
      "remove the concrete GitHub merge blocker before claiming external manifestation completion",
    );
  }

  if (!input.receipt.merge_commit_sha) {
    return block(
      input,
      "route_to_merge_blocker",
      ["merge result receipt has no merge commit SHA"],
      "read the GitHub merge result again or emit the exact missing-merge-sha blocker",
    );
  }

  if (input.pr_state_after_merge && input.pr_state_after_merge === "open") {
    return block(
      input,
      "route_to_merge_blocker",
      ["PR is still open after the merge result receipt"],
      "verify the GitHub merge result or remove the open-PR blocker before completion",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "complete_external_manifestation",
    completion_id: completionId,
    decisive_evidence: [
      ...evidence(input),
      completionId,
      ...input.receipt.decisive_evidence,
      ...(input.pr_state_after_merge ? [`post-merge PR state ${input.pr_state_after_merge}`] : []),
    ],
    blockers: [],
    next_route: "preserve the merge completion receipt and stop adding embodiment increments to the merged PR branch",
  };
}
