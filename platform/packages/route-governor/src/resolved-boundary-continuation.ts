export type ResolvedBoundaryMoveClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "pr_metadata_reread"
  | "duplicate_ci_summary"
  | "duplicate_comment"
  | "duplicate_label"
  | "local_memory_guard"
  | "guessed_future_ci"
  | "reclose_completed_blocker"
  | "old_repaired_head_blocker";

export type ResolvedBoundaryContinuationAction =
  | "admit_next_embodiment"
  | "admit_fresh_readback"
  | "emit_exact_blocker"
  | "block_unresolved_boundary"
  | "block_replayed_resolution"
  | "block_incomplete_embodiment"
  | "block_branch_mismatch";

export interface ResolvedBoundaryStatusSurface {
  head_sha: string;
  succeeded_run_ids: string[];
  expected_succeeded_run_ids: string[];
  non_blocking_warnings: string[];
  blocking_failures: string[];
  pending_surfaces: string[];
}

export interface ResolvedBoundaryCheckRun {
  id: string;
  head_sha: string;
}

export interface ResolvedBoundaryEmbodimentCandidate {
  artifact_class: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  spent_artifact_classes: string[];
}

export interface ResolvedBoundaryContinuationInput {
  branch: string;
  active_branch: string;
  live_head_sha: string;
  resolved_repaired_head_sha: string;
  completed_issue_state: "open" | "closed";
  blocked_label_present: boolean;
  pr_draft: boolean;
  repaired_head_status: ResolvedBoundaryStatusSurface;
  requested_move_class: ResolvedBoundaryMoveClass;
  new_check_runs?: ResolvedBoundaryCheckRun[];
  embodiment?: ResolvedBoundaryEmbodimentCandidate;
  exact_blocker?: string;
}

export interface ResolvedBoundaryContinuationVerdict {
  ok: boolean;
  action: ResolvedBoundaryContinuationAction;
  branch: string;
  head_sha: string;
  resolved_head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const REPLAY_MOVE_CLASSES = new Set<ResolvedBoundaryMoveClass>([
  "pr_metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "guessed_future_ci",
  "reclose_completed_blocker",
  "old_repaired_head_blocker",
]);

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function proofOnlyPath(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function base(input: ResolvedBoundaryContinuationInput): Pick<
  ResolvedBoundaryContinuationVerdict,
  "branch" | "head_sha" | "resolved_head_sha"
> {
  return {
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    resolved_head_sha: input.resolved_repaired_head_sha,
  };
}

function block(
  input: ResolvedBoundaryContinuationInput,
  action: Exclude<
    ResolvedBoundaryContinuationAction,
    "admit_next_embodiment" | "admit_fresh_readback" | "emit_exact_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  decisiveEvidence: string[] = [],
): ResolvedBoundaryContinuationVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: decisiveEvidence,
    blockers,
    next_route: nextRoute,
  };
}

function unresolvedBoundaryBlockers(input: ResolvedBoundaryContinuationInput): string[] {
  const blockers: string[] = [];
  const status = input.repaired_head_status;

  if (status.head_sha !== input.resolved_repaired_head_sha) {
    blockers.push(`status surface belongs to ${status.head_sha}, not resolved head ${input.resolved_repaired_head_sha}`);
  }
  for (const expected of status.expected_succeeded_run_ids) {
    if (!status.succeeded_run_ids.includes(expected)) {
      blockers.push(`resolved repaired-head status is missing succeeded run ${expected}`);
    }
  }
  if (status.blocking_failures.length > 0) blockers.push(...status.blocking_failures);
  if (status.pending_surfaces.length > 0) blockers.push(...status.pending_surfaces);
  if (input.completed_issue_state !== "closed") blockers.push("completed blocker issue is not closed");
  if (input.blocked_label_present) blockers.push("blocked: ci-status-readback label is still present");
  if (input.pr_draft) blockers.push("PR is still draft");

  return blockers;
}

function embodimentBlockers(candidate: ResolvedBoundaryEmbodimentCandidate | undefined): string[] {
  if (!candidate) return ["resolved-boundary continuation has no embodiment candidate"];

  const executableChanges = candidate.changed_files.filter(executablePlatformPath);
  const behaviorChanges = executableChanges.filter((path) => !proofOnlyPath(path));
  const blockers: string[] = [];

  if (!candidate.artifact_class.trim()) blockers.push("embodiment candidate has no artifact class");
  if (candidate.spent_artifact_classes.includes(candidate.artifact_class)) {
    blockers.push(`embodiment candidate repeats spent artifact class: ${candidate.artifact_class}`);
  }
  if (executableChanges.length === 0) blockers.push("embodiment candidate changes no executable platform files");
  if (executableChanges.length > 0 && behaviorChanges.length === 0) {
    blockers.push("embodiment candidate is proof-only and has no behavior-bearing file");
  }
  if (candidate.executable_artifacts.length === 0) blockers.push("embodiment candidate has no executable artifact");
  if (candidate.routing_artifacts.length === 0) blockers.push("embodiment candidate has no future-routing artifact");
  if (candidate.proof_artifacts.length === 0) blockers.push("embodiment candidate has no proof artifact");

  return blockers;
}

function freshCurrentHeadRuns(input: ResolvedBoundaryContinuationInput): ResolvedBoundaryCheckRun[] {
  const resolvedRuns = new Set(input.repaired_head_status.succeeded_run_ids);
  return (input.new_check_runs ?? []).filter((run) => run.head_sha === input.live_head_sha && !resolvedRuns.has(run.id));
}

export function compileResolvedBoundaryContinuation(
  input: ResolvedBoundaryContinuationInput,
): ResolvedBoundaryContinuationVerdict {
  if (input.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`resolved-boundary branch ${input.branch} does not match active branch ${input.active_branch}`],
      "bind the resolved boundary compiler to the active manifestation branch",
    );
  }

  const unresolved = unresolvedBoundaryBlockers(input);
  if (unresolved.length > 0) {
    return block(
      input,
      "block_unresolved_boundary",
      unresolved,
      "finish the repaired-head boundary before using it as a post-status handoff",
      [`resolved head candidate ${input.resolved_repaired_head_sha}`],
    );
  }

  if (REPLAY_MOVE_CLASSES.has(input.requested_move_class)) {
    return block(
      input,
      "block_replayed_resolution",
      [`resolved boundary cannot be counted through ${input.requested_move_class}`],
      "choose a behavior-bearing embodiment, a genuinely fresh readback, or a new exact blocker",
      [`resolved repaired head ${input.resolved_repaired_head_sha} already has completed status`],
    );
  }

  if (input.requested_move_class === "fresh_status_readback") {
    const headMoved = input.live_head_sha !== input.resolved_repaired_head_sha;
    const freshRuns = freshCurrentHeadRuns(input);
    if (!headMoved && freshRuns.length === 0) {
      return block(
        input,
        "block_replayed_resolution",
        ["fresh readback requires a moved PR head or new current-head check runs after the resolved boundary"],
        "move the branch with a non-repeated embodiment or wait for new current-head checks",
        [`resolved repaired head ${input.resolved_repaired_head_sha}`],
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_fresh_readback",
      decisive_evidence: [
        ...(headMoved ? [`live head moved from ${input.resolved_repaired_head_sha} to ${input.live_head_sha}`] : []),
        ...freshRuns.map((run) => `fresh current-head check run ${run.id}`),
      ],
      blockers: [],
      next_route: "read the fresh live-head status surface without replaying the resolved repaired-head blocker",
    };
  }

  if (input.requested_move_class === "exact_external_blocker") {
    const blocker = input.exact_blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_replayed_resolution",
        ["exact blocker route has no blocker text"],
        "name one concrete live external blocker or choose executable embodiment",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_exact_blocker",
      decisive_evidence: [blocker, `live head ${input.live_head_sha}`],
      blockers: [blocker],
      next_route: "remove the named blocker before another progress class",
    };
  }

  const blockers = embodimentBlockers(input.embodiment);
  if (blockers.length > 0) {
    return block(
      input,
      "block_incomplete_embodiment",
      blockers,
      "supply a non-repeated behavior-bearing embodiment candidate before moving past the resolved boundary",
      [`resolved repaired head ${input.resolved_repaired_head_sha} is completed`],
    );
  }

  const embodiment = input.embodiment;
  if (!embodiment) {
    return block(input, "block_incomplete_embodiment", ["missing embodiment candidate"], "supply an embodiment candidate");
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_next_embodiment",
    decisive_evidence: [
      `resolved repaired head ${input.resolved_repaired_head_sha}`,
      ...input.repaired_head_status.succeeded_run_ids.map((run) => `succeeded repaired-head run ${run}`),
      ...input.repaired_head_status.non_blocking_warnings.map((warning) => `non-blocking warning: ${warning}`),
      embodiment.artifact_class,
      ...embodiment.changed_files.filter(executablePlatformPath),
      ...embodiment.executable_artifacts,
      ...embodiment.routing_artifacts,
      ...embodiment.proof_artifacts,
    ],
    blockers: [],
    next_route: "commit the next embodiment increment, then require status readback for the new branch head",
  };
}
