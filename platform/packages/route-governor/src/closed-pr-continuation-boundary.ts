export type PullRequestLifecycleState = "open" | "closed";
export type ClosedPullRequestResolution = "merged" | "closed_unmerged" | "unknown";
export type ClosedPrContinuationAction =
  | "continue_branch_embodiment"
  | "route_to_successor_sink"
  | "emit_exact_external_blocker";

export interface ClosedPrContinuationInput {
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  state: PullRequestLifecycleState;
  merged?: boolean | null;
  mergeable?: boolean | null;
  branch_writable: boolean;
  allowed_progress_classes: string[];
}

export interface ClosedPrContinuationVerdict {
  ok: boolean;
  action: ClosedPrContinuationAction;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function hasAllowedClass(input: ClosedPrContinuationInput, progressClass: string): boolean {
  return input.allowed_progress_classes.includes(progressClass);
}

function resolutionFor(input: ClosedPrContinuationInput): ClosedPullRequestResolution {
  if (input.merged === true) return "merged";
  if (input.state === "closed" && input.merged === false) return "closed_unmerged";
  return "unknown";
}

export function routeClosedPrContinuation(input: ClosedPrContinuationInput): ClosedPrContinuationVerdict {
  const target = `${input.repository_full_name}#${input.pr_number}`;
  const decisive_evidence = [
    `target ${target}`,
    `branch ${input.branch}`,
    `head ${input.head_sha}`,
    `pr state ${input.state}`,
  ];

  if (input.state === "open") {
    if (!input.branch_writable) {
      return {
        ok: false,
        action: "emit_exact_external_blocker",
        branch: input.branch,
        head_sha: input.head_sha,
        decisive_evidence,
        blockers: [`${target} is open but branch ${input.branch} is not writable`],
        next_route: "restore a writable branch surface before attempting an embodiment commit",
      };
    }

    if (!hasAllowedClass(input, "external_platform_embodiment")) {
      return {
        ok: false,
        action: "emit_exact_external_blocker",
        branch: input.branch,
        head_sha: input.head_sha,
        decisive_evidence,
        blockers: [`${target} is open but external_platform_embodiment is not admitted for this turn`],
        next_route: "supply an admitted external embodiment candidate or a precise blocker",
      };
    }

    return {
      ok: true,
      action: "continue_branch_embodiment",
      branch: input.branch,
      head_sha: input.head_sha,
      decisive_evidence,
      blockers: [],
      next_route: "commit the next executable platform embodiment before making a status claim",
    };
  }

  const resolution = resolutionFor(input);
  if (resolution === "merged") {
    return {
      ok: true,
      action: "route_to_successor_sink",
      branch: input.branch,
      head_sha: input.head_sha,
      decisive_evidence: [...decisive_evidence, "pr resolution merged"],
      blockers: [],
      next_route: "select the merged successor branch or mainline sink before further embodiment",
    };
  }

  if (input.branch_writable && hasAllowedClass(input, "external_platform_embodiment")) {
    return {
      ok: true,
      action: "continue_branch_embodiment",
      branch: input.branch,
      head_sha: input.head_sha,
      decisive_evidence: [...decisive_evidence, `pr resolution ${resolution}`, "branch remains writable"],
      blockers: [],
      next_route: "continue only on the named branch surface and do not claim open PR review status",
    };
  }

  return {
    ok: false,
    action: "emit_exact_external_blocker",
    branch: input.branch,
    head_sha: input.head_sha,
    decisive_evidence: [...decisive_evidence, `pr resolution ${resolution}`],
    blockers: [`${target} is closed and no writable admitted embodiment surface remains`],
    next_route: "reopen the PR, select a successor sink, or restore a writable branch before further embodiment",
  };
}
