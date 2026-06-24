import type { PostMergeContinuationVerdict } from "./post-merge-continuation.js";

export type PostMergeMainlineOriginAction =
  | "compile_next_mainline_origin"
  | "block_unadmitted_post_merge"
  | "block_stale_merge_head"
  | "block_closed_pr_branch_origin"
  | "block_missing_next_branch"
  | "block_replayed_origin";

export interface PostMergeMainlineOriginInput {
  continuation: PostMergeContinuationVerdict;
  expected_head_sha: string;
  default_branch: string;
  next_branch: string;
  origin_id: string;
  spent_origin_ids: string[];
}

export interface PostMergeMainlineOriginCommand {
  operation: "create_branch";
  repository_full_name: string;
  base_ref: string;
  base_sha: string;
  branch: string;
  guard: {
    forbid_base_refs: string[];
    require_merge_commit_sha: string;
    require_post_merge_action: "admit_post_merge_platform_continuation";
  };
}

export interface PostMergeMainlineOriginVerdict {
  ok: boolean;
  action: PostMergeMainlineOriginAction;
  origin_id: string | null;
  command: PostMergeMainlineOriginCommand | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function evidence(input: PostMergeMainlineOriginInput): string[] {
  return [
    `post-merge action ${input.continuation.action}`,
    `receipt head ${input.continuation.head_sha}`,
    `expected head ${input.expected_head_sha}`,
    `merge commit ${input.continuation.merge_commit_sha ?? "<none>"}`,
    `default branch ${input.default_branch}`,
    `next branch ${input.next_branch}`,
  ];
}

function block(
  input: PostMergeMainlineOriginInput,
  action: Exclude<PostMergeMainlineOriginAction, "compile_next_mainline_origin">,
  blockers: string[],
  nextRoute: string,
): PostMergeMainlineOriginVerdict {
  return {
    ok: false,
    action,
    origin_id: null,
    command: null,
    decisive_evidence: evidence(input),
    blockers,
    next_route: nextRoute,
  };
}

export function compilePostMergeMainlineOrigin(
  input: PostMergeMainlineOriginInput,
): PostMergeMainlineOriginVerdict {
  if (!input.continuation.ok || input.continuation.action !== "admit_post_merge_platform_continuation") {
    return block(
      input,
      "block_unadmitted_post_merge",
      input.continuation.blockers.length > 0
        ? input.continuation.blockers
        : ["post-merge continuation has not been admitted"],
      "admit post-merge continuation before compiling the next mainline origin",
    );
  }

  if (input.continuation.head_sha !== input.expected_head_sha) {
    return block(
      input,
      "block_stale_merge_head",
      [`post-merge receipt head ${input.continuation.head_sha} is not expected head ${input.expected_head_sha}`],
      "discard the stale post-merge receipt and recompile from the merged live head",
    );
  }

  if (!input.continuation.merge_commit_sha) {
    return block(
      input,
      "block_unadmitted_post_merge",
      ["post-merge continuation has no merge commit SHA"],
      "read the merge result receipt before compiling a mainline origin",
    );
  }

  const nextBranch = input.next_branch.trim();
  if (!nextBranch) {
    return block(
      input,
      "block_missing_next_branch",
      ["next mainline continuation branch has no name"],
      "name the next platform branch before leaving the merged PR surface",
    );
  }

  if (nextBranch === input.continuation.branch || input.default_branch === input.continuation.branch) {
    return block(
      input,
      "block_closed_pr_branch_origin",
      [`post-merge origin cannot continue from closed PR branch ${input.continuation.branch}`],
      "start the next platform branch from the merge commit on the default branch",
    );
  }

  const originId = input.origin_id.trim();
  if (!originId || input.spent_origin_ids.includes(originId)) {
    return block(
      input,
      "block_replayed_origin",
      [originId ? `post-merge mainline origin already spent: ${originId}` : "post-merge mainline origin has no id"],
      "compile each post-merge origin once, with a fresh durable origin id",
    );
  }

  return {
    ok: true,
    action: "compile_next_mainline_origin",
    origin_id: originId,
    command: {
      operation: "create_branch",
      repository_full_name: input.continuation.repository_full_name,
      base_ref: input.default_branch,
      base_sha: input.continuation.merge_commit_sha,
      branch: nextBranch,
      guard: {
        forbid_base_refs: [input.continuation.branch, input.continuation.head_sha],
        require_merge_commit_sha: input.continuation.merge_commit_sha,
        require_post_merge_action: "admit_post_merge_platform_continuation",
      },
    },
    decisive_evidence: [
      ...evidence(input),
      `origin ${originId}`,
      `base ${input.default_branch}@${input.continuation.merge_commit_sha}`,
    ],
    blockers: [],
    next_route: "create the next platform branch from the merge commit on main, never from the closed PR branch or stale repaired-head status",
  };
}
