export type PostReadbackStatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "no_status_surface";

export type FailureIntakeAction =
  | "repair_from_actionable_failure"
  | "obtain_stronger_actions_log"
  | "wait_for_failing_status"
  | "block_stale_failure_surface"
  | "block_release";

export type PostReadbackCycleAction =
  | "commit_next_embodiment"
  | "read_current_head_status"
  | "repair_current_head_failure"
  | "obtain_current_head_failure_log"
  | "emit_exact_external_blocker"
  | "block_repeated_move_class";

export interface PostReadbackEmbodimentCandidate {
  candidate_id: string;
  move_class: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
}

export interface PostReadbackCycleInput {
  branch: string;
  active_branch: string;
  current_head_sha: string;
  last_readback_head_sha: string;
  status_verdict: PostReadbackStatusVerdict;
  candidate?: PostReadbackEmbodimentCandidate;
  spent_move_classes: string[];
  failure_intake_action?: FailureIntakeAction;
  failure_intake_blockers?: string[];
  exact_blocker?: string;
}

export interface PostReadbackCycleVerdict {
  ok: boolean;
  action: PostReadbackCycleAction;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function isExecutablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function candidateIsExecutable(candidate: PostReadbackEmbodimentCandidate): boolean {
  return candidate.changed_files.some(isExecutablePlatformPath) && candidate.executable_artifacts.length > 0;
}

function candidateHasRoutingArtifact(candidate: PostReadbackEmbodimentCandidate): boolean {
  return candidate.routing_artifacts.length > 0;
}

function headMovedSinceReadback(input: PostReadbackCycleInput): boolean {
  return input.current_head_sha !== input.last_readback_head_sha;
}

export function routePostReadbackCycle(input: PostReadbackCycleInput): PostReadbackCycleVerdict {
  const base = {
    branch: input.branch,
    head_sha: input.current_head_sha,
  };

  if (input.branch !== input.active_branch) {
    return {
      ...base,
      ok: false,
      action: "emit_exact_external_blocker",
      decisive_evidence: [],
      blockers: [`cycle branch ${input.branch} does not match active branch ${input.active_branch}`],
      next_route: "rebind the cycle router to the active PR branch before another continuation move",
    };
  }

  if (headMovedSinceReadback(input)) {
    return {
      ...base,
      ok: true,
      action: "read_current_head_status",
      decisive_evidence: [`head moved from ${input.last_readback_head_sha} to ${input.current_head_sha}`],
      blockers: [],
      next_route: "read only status surfaces bound to the moved PR head before claiming pass or failure",
    };
  }

  if (input.status_verdict === "pending" || input.status_verdict === "no_status_surface") {
    return {
      ...base,
      ok: false,
      action: "read_current_head_status",
      decisive_evidence: [`status verdict is ${input.status_verdict}`],
      blockers: ["current head does not have a complete status surface"],
      next_route: "wait for or obtain the current-head status surface before selecting repair or embodiment",
    };
  }

  if (input.status_verdict === "failing") {
    if (input.failure_intake_action === "repair_from_actionable_failure") {
      return {
        ...base,
        ok: true,
        action: "repair_current_head_failure",
        decisive_evidence: ["current-head failure intake exposed an actionable repair target"],
        blockers: [],
        next_route: "repair only the actionable current-head failure, then require a moved-head readback",
      };
    }

    return {
      ...base,
      ok: false,
      action: "obtain_current_head_failure_log",
      decisive_evidence: input.failure_intake_blockers ?? [],
      blockers: input.failure_intake_blockers?.length
        ? input.failure_intake_blockers
        : ["current head is failing without an actionable failure-intake result"],
      next_route: "obtain a current-head Actions log excerpt or assertion before editing code",
    };
  }

  if (!input.candidate) {
    return {
      ...base,
      ok: false,
      action: "emit_exact_external_blocker",
      decisive_evidence: [],
      blockers: [input.exact_blocker?.trim() || "no next embodiment candidate supplied after passing readback"],
      next_route: "supply one non-repeated executable embodiment candidate or name the exact external blocker",
    };
  }

  if (input.spent_move_classes.includes(input.candidate.move_class)) {
    return {
      ...base,
      ok: false,
      action: "block_repeated_move_class",
      decisive_evidence: [input.candidate.move_class],
      blockers: [`move class already spent: ${input.candidate.move_class}`],
      next_route: "select a new embodiment move class before changing the branch",
    };
  }

  const candidateBlockers: string[] = [];
  if (!candidateIsExecutable(input.candidate)) candidateBlockers.push("candidate does not change executable platform behavior");
  if (!candidateHasRoutingArtifact(input.candidate)) candidateBlockers.push("candidate does not leave a future-routing artifact");

  if (candidateBlockers.length > 0) {
    return {
      ...base,
      ok: false,
      action: "emit_exact_external_blocker",
      decisive_evidence: [input.candidate.candidate_id],
      blockers: candidateBlockers,
      next_route: "raise the candidate to executable behavior plus future-routing artifact before release",
    };
  }

  return {
    ...base,
    ok: true,
    action: "commit_next_embodiment",
    decisive_evidence: [
      input.candidate.candidate_id,
      ...input.candidate.changed_files,
      ...input.candidate.executable_artifacts,
      ...input.candidate.routing_artifacts,
    ],
    blockers: [],
    next_route: "commit the executable embodiment, then bind the next readback to the new PR head",
  };
}
