export type ClosedPrSinkState = "open" | "closed_unmerged" | "merged";

export type ClosedPrContinuationSurface = "pull_request" | "head_branch" | "new_pull_request" | "none";

export interface ClosedPrSinkBoundaryInput {
  pr_number: number;
  pr_state: ClosedPrSinkState;
  branch: string;
  head_sha: string;
  merged_at?: string | null;
  branch_writable: boolean;
  current_instruction_allows_branch_only: boolean;
  requested_surface: ClosedPrContinuationSurface;
}

export interface ClosedPrSinkBoundaryVerdict {
  ok: boolean;
  continuation_surface: ClosedPrContinuationSurface;
  release_class: "continue_on_open_pr" | "continue_on_branch_only" | "open_replacement_pr" | "exact_external_blocker";
  blockers: string[];
  next_route: string;
}

function isMerged(input: ClosedPrSinkBoundaryInput): boolean {
  return input.pr_state === "merged" || Boolean(input.merged_at?.trim());
}

function activePrLabel(input: ClosedPrSinkBoundaryInput): string {
  return `PR #${input.pr_number} / ${input.branch} @ ${input.head_sha}`;
}

export function compileClosedPrSinkBoundary(input: ClosedPrSinkBoundaryInput): ClosedPrSinkBoundaryVerdict {
  if (input.pr_state === "open") {
    return {
      ok: true,
      continuation_surface: "pull_request",
      release_class: "continue_on_open_pr",
      blockers: [],
      next_route: `continue external embodiment on ${activePrLabel(input)} and bind any status claim to that exact head`,
    };
  }

  if (isMerged(input)) {
    if (input.requested_surface === "pull_request") {
      return {
        ok: false,
        continuation_surface: "pull_request",
        release_class: "exact_external_blocker",
        blockers: [`${activePrLabel(input)} is merged/closed and can no longer serve as an open PR review surface`],
        next_route: "use an explicitly allowed branch-only embodiment, or create a replacement PR before making review-surface progress claims",
      };
    }

    if (input.branch_writable && input.current_instruction_allows_branch_only && input.requested_surface === "head_branch") {
      return {
        ok: true,
        continuation_surface: "head_branch",
        release_class: "continue_on_branch_only",
        blockers: [],
        next_route: `continue executable embodiment on branch ${input.branch} without claiming PR #${input.pr_number} remains an open review surface`,
      };
    }

    return {
      ok: false,
      continuation_surface: input.requested_surface,
      release_class: "exact_external_blocker",
      blockers: [
        `${activePrLabel(input)} is merged/closed`,
        input.branch_writable ? "branch-only continuation was not explicitly admitted" : "head branch is not writable from this surface",
      ],
      next_route: "obtain an explicit branch-only continuation surface or open a replacement PR",
    };
  }

  if (input.pr_state === "closed_unmerged") {
    return {
      ok: false,
      continuation_surface: input.requested_surface,
      release_class: "exact_external_blocker",
      blockers: [`${activePrLabel(input)} is closed without merge and cannot receive PR-surface embodiment progress`],
      next_route: "reopen the PR or create a replacement PR before claiming PR-surface progress",
    };
  }

  return {
    ok: false,
    continuation_surface: "none",
    release_class: "exact_external_blocker",
    blockers: [`unrecognized PR sink state for ${activePrLabel(input)}`],
    next_route: "re-read the external sink before continuing",
  };
}
