export type PostMergeSinkState =
  | "open_pr"
  | "merged_pr_closed"
  | "closed_unmerged_pr"
  | "branch_only"
  | "missing_external_sink";

export type PostMergeSinkAction =
  | "continue_on_open_pr"
  | "continue_on_branch_after_merge"
  | "emit_exact_external_blocker";

export interface PostMergeSinkInput {
  repository_full_name: string;
  pr_number: number;
  branch: string;
  prompt_head_sha: string;
  live_head_sha: string;
  pr_state: "open" | "closed";
  merged: boolean;
  draft: boolean;
  branch_exists: boolean;
  branch_accepts_writes: boolean;
  requested_surface: "github_pull_request" | "github_branch" | "github_pull_request_or_branch";
}

export interface PostMergeSinkVerdict {
  ok: boolean;
  sink_state: PostMergeSinkState;
  action: PostMergeSinkAction;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function clean(value: string): string {
  return value.trim();
}

function evidence(input: PostMergeSinkInput): string[] {
  return [
    `repository ${clean(input.repository_full_name) || "<missing>"}`,
    `pr #${input.pr_number}`,
    `branch ${clean(input.branch) || "<missing>"}`,
    `prompt head ${clean(input.prompt_head_sha) || "<missing>"}`,
    `live head ${clean(input.live_head_sha) || "<missing>"}`,
    `pr state ${input.pr_state}`,
    `merged ${input.merged}`,
    `draft ${input.draft}`,
    `branch exists ${input.branch_exists}`,
    `branch accepts writes ${input.branch_accepts_writes}`,
  ];
}

function blocker(input: PostMergeSinkInput, blockers: string[], nextRoute: string): PostMergeSinkVerdict {
  return {
    ok: false,
    sink_state: input.pr_state === "closed" && input.merged ? "merged_pr_closed" : "missing_external_sink",
    action: "emit_exact_external_blocker",
    branch: input.branch,
    head_sha: input.live_head_sha,
    decisive_evidence: evidence(input),
    blockers,
    next_route: nextRoute,
  };
}

export function routePostMergeSink(input: PostMergeSinkInput): PostMergeSinkVerdict {
  const baseEvidence = evidence(input);

  if (!clean(input.repository_full_name) || !clean(input.branch) || input.pr_number < 1) {
    return blocker(input, ["post-merge sink input is missing repository, branch, or PR number"], "bind the external sink before choosing a continuation surface");
  }

  if (!clean(input.live_head_sha)) {
    return blocker(input, ["post-merge sink has no live head sha"], "read the live branch or PR head before continuing");
  }

  if (input.pr_state === "open") {
    if (input.draft) {
      return blocker(input, ["active PR sink is still draft"], "mark the PR ready or choose an exact external blocker");
    }

    return {
      ok: true,
      sink_state: "open_pr",
      action: "continue_on_open_pr",
      branch: input.branch,
      head_sha: input.live_head_sha,
      decisive_evidence: baseEvidence,
      blockers: [],
      next_route: "continue on the open PR surface with head-bound checks and executable embodiment only",
    };
  }

  if (input.pr_state === "closed" && input.merged) {
    if (!input.branch_exists) {
      return blocker(
        input,
        ["PR sink is merged and closed, and the source branch is not available for continuation"],
        "create or select a new external branch/PR sink before the next embodiment increment",
      );
    }

    if (!input.branch_accepts_writes) {
      return blocker(
        input,
        ["PR sink is merged and closed, and the continuation branch does not accept writes"],
        "create or select a writable external branch/PR sink before the next embodiment increment",
      );
    }

    if (input.requested_surface === "github_pull_request") {
      return blocker(
        input,
        ["PR #2 is merged and closed; it cannot receive a new PR-surface embodiment increment"],
        "continue on the writable branch only, or open a new PR sink before claiming PR-surface progress",
      );
    }

    return {
      ok: true,
      sink_state: "merged_pr_closed",
      action: "continue_on_branch_after_merge",
      branch: input.branch,
      head_sha: input.live_head_sha,
      decisive_evidence: [
        ...baseEvidence,
        "merged PR cannot be treated as an open review surface",
        "writable branch remains the only valid continuation surface",
      ],
      blockers: [],
      next_route: "commit only branch-scoped executable embodiment, then perform a new head-bound status readback",
    };
  }

  if (input.pr_state === "closed") {
    return blocker(
      input,
      ["PR sink is closed without merge and cannot receive continuation work"],
      "reopen the PR or create a new external sink before the next embodiment increment",
    );
  }

  return blocker(input, ["external sink state is not actionable"], "obtain a fresh sink readback before continuing");
}

export function runPostMergeSinkRouterProof(): void {
  const mergedBranch = routePostMergeSink({
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch: "monday-platform-genesis-01",
    prompt_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
    live_head_sha: "4fbd48ca4539986c874f85394188c405b8d25600",
    pr_state: "closed",
    merged: true,
    draft: false,
    branch_exists: true,
    branch_accepts_writes: true,
    requested_surface: "github_pull_request_or_branch",
  });

  if (!mergedBranch.ok || mergedBranch.action !== "continue_on_branch_after_merge") {
    throw new Error(`post-merge branch continuation proof failed: ${mergedBranch.blockers.join("; ")}`);
  }

  const falsePrSurface = routePostMergeSink({
    ...{
      repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
      pr_number: 2,
      branch: "monday-platform-genesis-01",
      prompt_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
      live_head_sha: "4fbd48ca4539986c874f85394188c405b8d25600",
      pr_state: "closed" as const,
      merged: true,
      draft: false,
      branch_exists: true,
      branch_accepts_writes: true,
    },
    requested_surface: "github_pull_request",
  });

  if (falsePrSurface.ok || falsePrSurface.action !== "emit_exact_external_blocker") {
    throw new Error("post-merge router allowed a closed PR to masquerade as an open PR surface");
  }

  const deletedBranch = routePostMergeSink({
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch: "monday-platform-genesis-01",
    prompt_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
    live_head_sha: "4fbd48ca4539986c874f85394188c405b8d25600",
    pr_state: "closed",
    merged: true,
    draft: false,
    branch_exists: false,
    branch_accepts_writes: false,
    requested_surface: "github_pull_request_or_branch",
  });

  if (deletedBranch.ok || !deletedBranch.blockers.some((item) => item.includes("source branch is not available"))) {
    throw new Error("post-merge router failed to block a merged PR with no continuation branch");
  }
}
