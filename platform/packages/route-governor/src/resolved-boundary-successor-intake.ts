export type ResolvedBoundarySuccessorProgressClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "pr_metadata_reread"
  | "duplicate_ci_summary"
  | "duplicate_comment"
  | "duplicate_label"
  | "local_memory_guard"
  | "guessed_future_ci"
  | "reclose_resolved_blocker"
  | "repaired_head_status_readback"
  | "warning_maintenance";

export type ResolvedBoundarySuccessorAction =
  | "admit_successor_external_embodiment"
  | "admit_successor_status_readback"
  | "emit_successor_exact_blocker"
  | "block_missing_resolved_boundary"
  | "block_branch_mismatch"
  | "block_non_progress_class"
  | "block_stale_successor_base"
  | "block_incomplete_successor_embodiment"
  | "block_stale_status_readback"
  | "block_missing_exact_blocker";

export interface ResolvedBoundarySuccessorCandidate {
  progress_class: ResolvedBoundarySuccessorProgressClass;
  branch: string;
  base_head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  status_surface_ids: string[];
  current_head_check_ids: string[];
  blocker?: string;
}

export interface ResolvedBoundarySuccessorIntakeInput {
  active_branch: string;
  live_head_sha: string;
  instruction_head_sha: string;
  resolved_repaired_head_sha: string;
  resolved_boundary_ids: string[];
  last_status_readback_head_sha?: string;
  candidate: ResolvedBoundarySuccessorCandidate;
}

export interface ResolvedBoundarySuccessorIntakeVerdict {
  ok: boolean;
  action: ResolvedBoundarySuccessorAction;
  branch: string;
  head_sha: string;
  instruction_head_is_current: boolean;
  retired_head_shas: string[];
  resolved_boundary_ids: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_CLASSES = new Set<ResolvedBoundarySuccessorProgressClass>([
  "pr_metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "guessed_future_ci",
  "reclose_resolved_blocker",
  "repaired_head_status_readback",
  "warning_maintenance",
]);

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(?:ts|js|mjs|json)$/.test(path);
}

function behaviorPath(path: string): boolean {
  return executablePlatformPath(path) && !/(?:\.test|-proof)\.ts$/.test(path);
}

function retiredHeads(input: ResolvedBoundarySuccessorIntakeInput): string[] {
  const retired = new Set<string>();
  if (input.instruction_head_sha !== input.live_head_sha) retired.add(input.instruction_head_sha);
  if (input.resolved_repaired_head_sha !== input.live_head_sha) retired.add(input.resolved_repaired_head_sha);
  if (input.last_status_readback_head_sha && input.last_status_readback_head_sha !== input.live_head_sha) {
    retired.add(input.last_status_readback_head_sha);
  }
  return [...retired];
}

function base(input: ResolvedBoundarySuccessorIntakeInput): Pick<
  ResolvedBoundarySuccessorIntakeVerdict,
  "branch" | "head_sha" | "instruction_head_is_current" | "retired_head_shas" | "resolved_boundary_ids"
> {
  return {
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    instruction_head_is_current: input.instruction_head_sha === input.live_head_sha,
    retired_head_shas: retiredHeads(input),
    resolved_boundary_ids: input.resolved_boundary_ids,
  };
}

function block(
  input: ResolvedBoundarySuccessorIntakeInput,
  action: Exclude<
    ResolvedBoundarySuccessorAction,
    "admit_successor_external_embodiment" | "admit_successor_status_readback" | "emit_successor_exact_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ResolvedBoundarySuccessorIntakeVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function embodimentBlockers(candidate: ResolvedBoundarySuccessorCandidate): string[] {
  const blockers: string[] = [];
  if (!candidate.changed_files.some(behaviorPath)) blockers.push("successor embodiment changes no behavior-bearing platform file");
  if (candidate.executable_artifacts.length === 0) blockers.push("successor embodiment has no executable artifact evidence");
  if (candidate.routing_artifacts.length === 0) blockers.push("successor embodiment has no future-routing artifact evidence");
  if (candidate.proof_artifacts.length === 0) blockers.push("successor embodiment has no proof artifact evidence");
  return blockers;
}

export function intakeResolvedBoundarySuccessor(
  input: ResolvedBoundarySuccessorIntakeInput,
): ResolvedBoundarySuccessorIntakeVerdict {
  const candidate = input.candidate;

  if (input.resolved_boundary_ids.length === 0) {
    return block(
      input,
      "block_missing_resolved_boundary",
      ["successor intake requires the resolved repaired-head boundary id"],
      "resolve the repaired-head boundary before admitting successor-head progress",
    );
  }

  if (candidate.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`],
      "bind successor progress to the active PR branch before release",
    );
  }

  if (NON_PROGRESS_CLASSES.has(candidate.progress_class)) {
    return block(
      input,
      "block_non_progress_class",
      [`resolved-boundary successor progress class is non-progress: ${candidate.progress_class}`],
      "choose a successor-head embodiment, legitimate successor-head status readback, or one exact external blocker",
      [candidate.progress_class, ...retiredHeads(input), ...input.resolved_boundary_ids],
    );
  }

  if (candidate.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_successor_base",
      [`candidate base ${candidate.base_head_sha} is not live successor head ${input.live_head_sha}`],
      "discard prompt-carried or repaired-head bases; rebuild the candidate on the live successor head",
      [`instruction head ${input.instruction_head_sha}`, `resolved repaired head ${input.resolved_repaired_head_sha}`],
    );
  }

  if (candidate.progress_class === "fresh_status_readback") {
    const headMoved = input.last_status_readback_head_sha !== input.live_head_sha;
    const hasCurrentSurface = candidate.status_surface_ids.length > 0 || candidate.current_head_check_ids.length > 0;

    if (!headMoved && !hasCurrentSurface) {
      return block(
        input,
        "block_stale_status_readback",
        ["successor status readback requires a moved head or concrete current-head status evidence"],
        "do not publish another status readback until the successor head moves or new current-head checks appear",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_successor_status_readback",
      decisive_evidence: [
        ...(headMoved ? [`head moved from ${input.last_status_readback_head_sha ?? "<none>"} to ${input.live_head_sha}`] : []),
        ...candidate.status_surface_ids.map((id) => `status surface ${id}`),
        ...candidate.current_head_check_ids.map((id) => `current-head check ${id}`),
      ],
      blockers: [],
      next_route: "read only status evidence bound to the live successor head; keep repaired-head checks retired",
    };
  }

  if (candidate.progress_class === "exact_external_blocker") {
    const blocker = candidate.blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_missing_exact_blocker",
        ["successor exact-blocker candidate has no blocker text"],
        "name the exact live successor-head blocker or choose a valid embodiment/status route",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_successor_exact_blocker",
      decisive_evidence: [blocker, `live successor head ${input.live_head_sha}`],
      blockers: [blocker],
      next_route: "remove the named successor-head blocker before attempting another progress class",
    };
  }

  const blockers = embodimentBlockers(candidate);
  if (blockers.length > 0) {
    return block(
      input,
      "block_incomplete_successor_embodiment",
      blockers,
      "supply behavior-bearing file, executable artifact, routing artifact, and proof artifact before moving the branch",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_successor_external_embodiment",
    decisive_evidence: [
      `live successor head ${input.live_head_sha}`,
      ...input.resolved_boundary_ids.map((id) => `resolved boundary ${id}`),
      ...candidate.changed_files.filter(executablePlatformPath),
      ...candidate.executable_artifacts,
      ...candidate.routing_artifacts,
      ...candidate.proof_artifacts,
    ],
    blockers: [],
    next_route: "commit the successor embodiment, then bind the next status readback to the moved head only",
  };
}
