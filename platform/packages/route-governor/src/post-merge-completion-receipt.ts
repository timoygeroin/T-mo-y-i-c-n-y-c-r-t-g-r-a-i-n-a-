export type PostMergeCompletionAction =
  | "seal_post_merge_completion"
  | "block_unmerged_pr"
  | "block_stale_merge_head"
  | "block_branch_mismatch"
  | "block_repeated_receipt"
  | "block_missing_merge_evidence";

export interface PostMergeCompletionSurface {
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  state: "open" | "closed";
  merged: boolean;
  merged_at?: string | null;
  merge_commit_sha?: string | null;
  evidence: string[];
}

export interface PostMergeCompletionReceiptInput {
  active_branch: string;
  live_head_sha: string;
  receipt_id: string;
  spent_receipt_ids: string[];
  surface: PostMergeCompletionSurface;
}

export interface PostMergeCompletionReceiptVerdict {
  ok: boolean;
  action: PostMergeCompletionAction;
  receipt_id: string | null;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function base(input: PostMergeCompletionReceiptInput): Pick<
  PostMergeCompletionReceiptVerdict,
  "receipt_id" | "repository_full_name" | "pr_number" | "branch" | "head_sha"
> {
  return {
    receipt_id: input.receipt_id.trim() || null,
    repository_full_name: input.surface.repository_full_name,
    pr_number: input.surface.pr_number,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
  };
}

function evidence(input: PostMergeCompletionReceiptInput): string[] {
  const surface = input.surface;
  return [
    `receipt ${input.receipt_id.trim() || "<missing>"}`,
    `pr ${surface.pr_number}`,
    `state ${surface.state}`,
    `merged ${surface.merged}`,
    `surface head ${surface.head_sha}`,
    `live head ${input.live_head_sha}`,
    ...surface.evidence,
  ];
}

function block(
  input: PostMergeCompletionReceiptInput,
  action: Exclude<PostMergeCompletionAction, "seal_post_merge_completion">,
  blockers: string[],
  nextRoute: string,
): PostMergeCompletionReceiptVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence(input),
    blockers,
    next_route: nextRoute,
  };
}

export function compilePostMergeCompletionReceipt(
  input: PostMergeCompletionReceiptInput,
): PostMergeCompletionReceiptVerdict {
  const receiptId = input.receipt_id.trim();
  const surface = input.surface;

  if (!receiptId || input.spent_receipt_ids.includes(receiptId)) {
    return block(
      input,
      "block_repeated_receipt",
      [receiptId ? `post-merge completion receipt already spent: ${receiptId}` : "post-merge completion receipt has no id"],
      "capture a fresh merged PR surface before sealing completion",
    );
  }

  if (surface.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`merged PR branch ${surface.branch} is not active branch ${input.active_branch}`],
      "discard cross-branch merge surfaces before sealing completion",
    );
  }

  if (surface.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_merge_head",
      [`merged PR head ${surface.head_sha} is not live head ${input.live_head_sha}`],
      "refresh the merged PR surface for the live branch head before sealing completion",
    );
  }

  if (surface.evidence.length === 0 || !surface.merged_at?.trim() || !surface.merge_commit_sha?.trim()) {
    return block(
      input,
      "block_missing_merge_evidence",
      ["post-merge completion requires merged_at, merge_commit_sha, and external evidence"],
      "attach the live GitHub merge surface before closing the manifestation route",
    );
  }

  if (surface.state !== "closed" || !surface.merged) {
    return block(
      input,
      "block_unmerged_pr",
      [`PR ${surface.pr_number} is not a closed merged PR`],
      "continue through the open-PR embodiment route until a merge completion surface exists",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "seal_post_merge_completion",
    decisive_evidence: [
      ...evidence(input),
      `merged at ${surface.merged_at}`,
      `merge commit ${surface.merge_commit_sha}`,
    ],
    blockers: [],
    next_route: "treat this PR sink as completed; future embodiment must use a new explicit external sink",
  };
}
