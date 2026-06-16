export type ResolvedBoundaryStatusVerdict = "passing" | "passing_with_warnings";

export type ResolvedBoundaryMoveClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "duplicate_ci_summary"
  | "metadata_reread"
  | "duplicate_comment"
  | "duplicate_label"
  | "reclose_resolved_blocker"
  | "local_memory_guard"
  | "guessed_future_ci";

export type ResolvedBoundaryEmbodimentAction =
  | "admit_resolved_boundary_embodiment"
  | "block_unresolved_boundary"
  | "block_branch_mismatch"
  | "block_non_progress_move"
  | "block_stale_base_head"
  | "block_replayed_artifact_class"
  | "block_incomplete_embodiment"
  | "block_invalid_result_head";

export interface ResolvedBoundaryStatusEvidence {
  repaired_head_sha: string;
  verdict: ResolvedBoundaryStatusVerdict;
  successful_check_names: string[];
  successful_run_ids: string[];
  resolved_blocker_ids: string[];
  non_blocking_warnings: string[];
}

export interface ResolvedBoundaryEmbodimentCandidate {
  candidate_id: string;
  move_class: ResolvedBoundaryMoveClass;
  branch: string;
  base_head_sha: string;
  artifact_class: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  result_head_sha?: string;
}

export interface ResolvedBoundaryEmbodimentPlanInput {
  active_branch: string;
  live_head_sha: string;
  repaired_head_sha: string;
  status: ResolvedBoundaryStatusEvidence;
  spent_artifact_classes: string[];
  prohibited_move_classes: ResolvedBoundaryMoveClass[];
  candidate: ResolvedBoundaryEmbodimentCandidate;
}

export interface ResolvedBoundaryEmbodimentPlan {
  ok: boolean;
  action: ResolvedBoundaryEmbodimentAction;
  branch: string;
  base_head_sha: string;
  result_head_sha: string | null;
  next_status_expected_head: string | null;
  decisive_evidence: string[];
  retired_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

const NON_PROGRESS_MOVES = new Set<ResolvedBoundaryMoveClass>([
  "fresh_status_readback",
  "duplicate_ci_summary",
  "metadata_reread",
  "duplicate_comment",
  "duplicate_label",
  "reclose_resolved_blocker",
  "local_memory_guard",
  "guessed_future_ci",
]);

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function proofOnlyPath(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function base(input: ResolvedBoundaryEmbodimentPlanInput): Pick<
  ResolvedBoundaryEmbodimentPlan,
  "branch" | "base_head_sha" | "result_head_sha" | "next_status_expected_head" | "warnings"
> {
  const resultHead = input.candidate.result_head_sha ?? null;
  return {
    branch: input.active_branch,
    base_head_sha: input.live_head_sha,
    result_head_sha: resultHead,
    next_status_expected_head: resultHead,
    warnings: input.status.non_blocking_warnings,
  };
}

function block(
  input: ResolvedBoundaryEmbodimentPlanInput,
  action: Exclude<ResolvedBoundaryEmbodimentAction, "admit_resolved_boundary_embodiment">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ResolvedBoundaryEmbodimentPlan {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    retired_evidence: [],
    blockers,
    next_route: nextRoute,
  };
}

function candidateBlockers(candidate: ResolvedBoundaryEmbodimentCandidate): string[] {
  const executableFiles = candidate.changed_files.filter(executablePlatformPath);
  const behaviorFiles = executableFiles.filter((path) => !proofOnlyPath(path));
  const blockers: string[] = [];

  if (!candidate.candidate_id.trim()) blockers.push("resolved-boundary embodiment has no candidate id");
  if (!candidate.artifact_class.trim()) blockers.push("resolved-boundary embodiment has no artifact class");
  if (executableFiles.length === 0) blockers.push("resolved-boundary embodiment changes no executable platform file");
  if (executableFiles.length > 0 && behaviorFiles.length === 0) {
    blockers.push("resolved-boundary embodiment is proof-only and changes no behavior file");
  }
  if (candidate.executable_artifacts.length === 0) {
    blockers.push("resolved-boundary embodiment has no executable artifact evidence");
  }
  if (candidate.routing_artifacts.length === 0) {
    blockers.push("resolved-boundary embodiment has no future-routing artifact evidence");
  }
  if (candidate.proof_artifacts.length === 0) {
    blockers.push("resolved-boundary embodiment has no proof artifact evidence");
  }

  return blockers;
}

function retiredEvidence(input: ResolvedBoundaryEmbodimentPlanInput): string[] {
  return [
    `repaired-head status boundary resolved: ${input.repaired_head_sha}`,
    ...input.status.successful_check_names.map((name) => `successful repaired-head check: ${name}`),
    ...input.status.successful_run_ids.map((id) => `successful repaired-head run: ${id}`),
    ...input.status.resolved_blocker_ids.map((id) => `resolved blocker retired: ${id}`),
  ];
}

export function compileResolvedBoundaryEmbodimentPlan(
  input: ResolvedBoundaryEmbodimentPlanInput,
): ResolvedBoundaryEmbodimentPlan {
  const candidate = input.candidate;

  if (input.status.repaired_head_sha !== input.repaired_head_sha) {
    return block(
      input,
      "block_unresolved_boundary",
      [`status evidence targets ${input.status.repaired_head_sha}, not repaired head ${input.repaired_head_sha}`],
      "bind the resolved boundary to the repaired head before admitting embodiment",
    );
  }

  if (input.live_head_sha !== input.repaired_head_sha) {
    return block(
      input,
      "block_stale_base_head",
      [`live head ${input.live_head_sha} is not the repaired boundary head ${input.repaired_head_sha}`],
      "rebase the resolved-boundary embodiment to the live PR head before release",
      retiredEvidence(input),
    );
  }

  if (input.status.successful_check_names.length === 0 || input.status.successful_run_ids.length === 0) {
    return block(
      input,
      "block_unresolved_boundary",
      ["resolved boundary has no successful check/run evidence"],
      "obtain successful repaired-head evidence before retiring the old status blocker",
    );
  }

  if (input.status.resolved_blocker_ids.length === 0) {
    return block(
      input,
      "block_unresolved_boundary",
      ["resolved boundary has no retired blocker id"],
      "name the retired external blocker before admitting post-boundary embodiment",
    );
  }

  if (candidate.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`],
      "bind the embodiment to the active PR branch before release",
    );
  }

  if (candidate.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_base_head",
      [`candidate base ${candidate.base_head_sha} is not live head ${input.live_head_sha}`],
      "rebase the embodiment candidate to the resolved live head before writing",
      retiredEvidence(input),
    );
  }

  if (input.prohibited_move_classes.includes(candidate.move_class) || NON_PROGRESS_MOVES.has(candidate.move_class)) {
    return block(
      input,
      "block_non_progress_move",
      [`resolved-boundary move class is non-progress: ${candidate.move_class}`],
      "choose a new executable platform embodiment, not another status/metadata/comment/label/memory action",
      retiredEvidence(input),
    );
  }

  if (input.spent_artifact_classes.includes(candidate.artifact_class)) {
    return block(
      input,
      "block_replayed_artifact_class",
      [`artifact class already spent: ${candidate.artifact_class}`],
      "choose an unspent behavior-bearing artifact class before moving the branch",
    );
  }

  const blockers = candidateBlockers(candidate);
  if (blockers.length > 0) {
    return block(
      input,
      "block_incomplete_embodiment",
      blockers,
      "supply behavior, routing, and proof evidence before claiming post-boundary progress",
    );
  }

  if (candidate.result_head_sha && candidate.result_head_sha === input.live_head_sha) {
    return block(
      input,
      "block_invalid_result_head",
      [`result head ${candidate.result_head_sha} does not move beyond live head ${input.live_head_sha}`],
      "write the embodiment first; bind the next status readback to the moved branch head",
    );
  }

  const nextHead = candidate.result_head_sha ?? "post-write-head";

  return {
    ...base(input),
    ok: true,
    action: "admit_resolved_boundary_embodiment",
    result_head_sha: candidate.result_head_sha ?? null,
    next_status_expected_head: nextHead,
    decisive_evidence: [
      candidate.candidate_id,
      candidate.artifact_class,
      ...candidate.changed_files.filter(executablePlatformPath),
      ...candidate.executable_artifacts,
      ...candidate.routing_artifacts,
      ...candidate.proof_artifacts,
    ],
    retired_evidence: retiredEvidence(input),
    blockers: [],
    warnings: input.status.non_blocking_warnings,
    next_route: "commit this non-repeated embodiment; after the branch moves, status authority must bind to the moved head only",
  };
}
