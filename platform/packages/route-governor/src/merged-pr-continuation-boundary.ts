export type MergedPrContinuationRequestedSurface = "pr_only" | "branch_only" | "pr_or_branch";

export type MergedPrContinuationAction =
  | "continue_open_pr_surface"
  | "route_branch_only_continuation"
  | "seal_merged_pr_surface"
  | "emit_exact_external_blocker"
  | "block_missing_merge_receipt"
  | "block_unreadable_branch_surface";

export interface MergedPrContinuationBoundaryInput {
  repository_full_name: string;
  pr_number: number;
  branch: string;
  prompt_head_sha: string;
  live_head_sha: string;
  pr_state: "open" | "closed";
  merged: boolean;
  branch_readable: boolean;
  branch_continuation_admitted: boolean;
  requested_surface: MergedPrContinuationRequestedSurface;
  merge_commit_sha?: string | null;
  evidence: string[];
}

export interface MergedPrContinuationBoundaryVerdict {
  ok: boolean;
  action: MergedPrContinuationAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  prompt_head_sha: string;
  live_head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

function evidence(input: MergedPrContinuationBoundaryInput): string[] {
  return [
    `${input.repository_full_name}#${input.pr_number}`,
    `branch ${input.branch}`,
    `prompt head ${input.prompt_head_sha}`,
    `live head ${input.live_head_sha}`,
    `pr state ${input.pr_state}`,
    `merged ${input.merged}`,
    ...input.evidence,
  ];
}

function base(input: MergedPrContinuationBoundaryInput): Omit<
  MergedPrContinuationBoundaryVerdict,
  "ok" | "action" | "blockers" | "warnings" | "next_route"
> {
  return {
    repository_full_name: input.repository_full_name,
    pr_number: input.pr_number,
    branch: input.branch,
    prompt_head_sha: input.prompt_head_sha,
    live_head_sha: input.live_head_sha,
    decisive_evidence: evidence(input),
  };
}

export function routeMergedPrContinuationBoundary(
  input: MergedPrContinuationBoundaryInput,
): MergedPrContinuationBoundaryVerdict {
  if (!input.branch_readable) {
    return {
      ...base(input),
      ok: false,
      action: "block_unreadable_branch_surface",
      blockers: [`branch ${input.branch} is not readable as an external embodiment surface`],
      warnings: [],
      next_route: "restore a readable branch surface before attempting PR or branch embodiment continuation",
    };
  }

  if (input.pr_state === "open" && !input.merged) {
    return {
      ...base(input),
      ok: true,
      action: "continue_open_pr_surface",
      blockers: [],
      warnings: input.prompt_head_sha === input.live_head_sha ? [] : [`prompt head ${input.prompt_head_sha} differs from live head ${input.live_head_sha}`],
      next_route: "continue only with a non-repeated executable platform embodiment increment or a head-bound status readback",
    };
  }

  if (input.pr_state === "closed" && input.merged) {
    const mergeCommit = input.merge_commit_sha?.trim();
    if (!mergeCommit) {
      return {
        ...base(input),
        ok: false,
        action: "block_missing_merge_receipt",
        blockers: [`merged PR #${input.pr_number} has no merge commit receipt`],
        warnings: [],
        next_route: "obtain the merge commit receipt before sealing the PR surface or routing branch-only continuation",
      };
    }

    if (input.requested_surface !== "pr_only" && input.branch_continuation_admitted) {
      return {
        ...base(input),
        ok: true,
        action: "route_branch_only_continuation",
        blockers: [],
        warnings: [
          `PR #${input.pr_number} is merged at ${mergeCommit}; branch commits no longer update that PR review surface`,
          ...(input.prompt_head_sha === input.live_head_sha ? [] : [`prompt head ${input.prompt_head_sha} differs from live head ${input.live_head_sha}`]),
        ],
        next_route: "treat the branch as a branch-only embodiment surface; do not describe future branch commits as PR #2 progress",
      };
    }

    return {
      ...base(input),
      ok: true,
      action: "seal_merged_pr_surface",
      blockers: [],
      warnings: [`PR #${input.pr_number} is already merged at ${mergeCommit}`],
      next_route: "stop adding PR-branch embodiment increments; choose a new external sink or explicitly admit branch-only continuation",
    };
  }

  return {
    ...base(input),
    ok: false,
    action: "emit_exact_external_blocker",
    blockers: [`PR #${input.pr_number} is closed and unmerged`],
    warnings: [],
    next_route: "open a new external manifestation sink before attempting another embodiment increment",
  };
}
