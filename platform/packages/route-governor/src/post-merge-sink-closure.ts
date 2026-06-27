export type PostMergeSinkClosureAction =
  | "seal_merged_pr_sink"
  | "route_to_moved_head_readback"
  | "block_reused_closure"
  | "block_pr_number_mismatch"
  | "block_branch_mismatch"
  | "block_unmerged_sink"
  | "block_missing_merge_commit";

export interface ObservedPullRequestSink {
  pr_number: number;
  state: "open" | "closed";
  merged: boolean;
  draft: boolean;
  head_branch: string;
  head_sha: string;
  merge_commit_sha?: string | null;
}

export interface PostMergeSinkClosureInput {
  closure_id: string;
  spent_closure_ids: string[];
  active_pr_number: number;
  active_branch: string;
  previous_active_head_sha: string;
  observed_pr: ObservedPullRequestSink;
}

export interface PostMergeSinkClosureReceipt {
  ok: boolean;
  action: PostMergeSinkClosureAction;
  closure_id: string | null;
  pr_number: number;
  branch: string;
  head_sha: string;
  merge_commit_sha: string | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function evidence(input: PostMergeSinkClosureInput): string[] {
  return [
    `closure ${input.closure_id.trim() || "<missing>"}`,
    `PR #${input.observed_pr.pr_number}`,
    `state ${input.observed_pr.state}`,
    `merged ${input.observed_pr.merged}`,
    `draft ${input.observed_pr.draft}`,
    `head branch ${input.observed_pr.head_branch}`,
    `head ${input.observed_pr.head_sha}`,
    `previous active head ${input.previous_active_head_sha}`,
    ...(input.observed_pr.merge_commit_sha ? [`merge commit ${input.observed_pr.merge_commit_sha}`] : []),
  ];
}

function base(input: PostMergeSinkClosureInput): Pick<
  PostMergeSinkClosureReceipt,
  "closure_id" | "pr_number" | "branch" | "head_sha" | "merge_commit_sha"
> {
  return {
    closure_id: input.closure_id.trim() || null,
    pr_number: input.active_pr_number,
    branch: input.active_branch,
    head_sha: input.observed_pr.head_sha,
    merge_commit_sha: input.observed_pr.merge_commit_sha?.trim() || null,
  };
}

function block(
  input: PostMergeSinkClosureInput,
  action: Exclude<PostMergeSinkClosureAction, "seal_merged_pr_sink" | "route_to_moved_head_readback">,
  blockers: string[],
  nextRoute: string,
): PostMergeSinkClosureReceipt {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence(input),
    blockers,
    next_route: nextRoute,
  };
}

export function closeMergedPrSink(input: PostMergeSinkClosureInput): PostMergeSinkClosureReceipt {
  const closureId = input.closure_id.trim();

  if (!closureId || input.spent_closure_ids.includes(closureId)) {
    return block(
      input,
      "block_reused_closure",
      [closureId ? `post-merge sink closure already spent: ${closureId}` : "post-merge sink closure has no id"],
      "compile a fresh post-merge closure receipt before consuming a merged PR sink",
    );
  }

  if (input.observed_pr.pr_number !== input.active_pr_number) {
    return block(
      input,
      "block_pr_number_mismatch",
      [`observed PR #${input.observed_pr.pr_number} is not active PR #${input.active_pr_number}`],
      "discard cross-PR closure evidence before post-merge routing",
    );
  }

  if (input.observed_pr.head_branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`observed head branch ${input.observed_pr.head_branch} is not active branch ${input.active_branch}`],
      "discard cross-branch closure evidence before successor-sink selection",
    );
  }

  if (input.observed_pr.head_sha !== input.previous_active_head_sha) {
    return {
      ...base(input),
      ok: false,
      action: "route_to_moved_head_readback",
      decisive_evidence: evidence(input),
      blockers: [`fresh status/readback required for moved post-merge head ${input.observed_pr.head_sha}`],
      next_route: "obtain moved-head readback before sealing the merged PR sink or selecting a successor",
    };
  }

  if (input.observed_pr.state !== "closed" || !input.observed_pr.merged) {
    return block(
      input,
      "block_unmerged_sink",
      [`PR #${input.active_pr_number} is ${input.observed_pr.state} and merged=${input.observed_pr.merged}`],
      "continue active PR routing until GitHub reports the sink closed and merged",
    );
  }

  const mergeCommit = input.observed_pr.merge_commit_sha?.trim();
  if (!mergeCommit) {
    return block(
      input,
      "block_missing_merge_commit",
      ["merged PR sink has no merge commit SHA"],
      "read the merged PR metadata again or emit the exact missing-merge-commit blocker",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "seal_merged_pr_sink",
    merge_commit_sha: mergeCommit,
    decisive_evidence: evidence(input),
    blockers: [],
    next_route: "seal PR #2 as consumed and route all further embodiment through post-merge successor sink selection",
  };
}
