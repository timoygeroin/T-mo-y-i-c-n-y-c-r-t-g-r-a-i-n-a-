export type PostResolutionAllowedProgressClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker";

export type PostResolutionCandidateClass =
  | PostResolutionAllowedProgressClass
  | "metadata_reread"
  | "duplicate_ci_summary"
  | "duplicate_comment"
  | "duplicate_label"
  | "local_memory_guard"
  | "guessed_future_ci"
  | "reclose_completed_blocker"
  | "old_repaired_head_blocker";

export type PostResolutionProgressGateAction =
  | "admit_external_platform_embodiment"
  | "admit_fresh_status_readback"
  | "emit_exact_external_blocker"
  | "block_unresolved_boundary"
  | "block_branch_mismatch"
  | "block_stale_base_head"
  | "block_repeated_non_progress"
  | "block_stale_status_readback"
  | "block_incomplete_embodiment"
  | "block_incomplete_blocker";

export interface PostResolutionProgressCandidate {
  candidate_id: string;
  progress_class: PostResolutionCandidateClass;
  branch: string;
  base_head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  new_current_head_check_ids?: string[];
  blocker?: string;
}

export interface PostResolutionProgressGateInput {
  active_branch: string;
  live_head_sha: string;
  repaired_head_sha: string;
  last_status_readback_head_sha: string;
  resolved_boundary_ids: string[];
  forbidden_repeat_classes: PostResolutionCandidateClass[];
  candidate: PostResolutionProgressCandidate;
}

export interface PostResolutionProgressGateVerdict {
  ok: boolean;
  action: PostResolutionProgressGateAction;
  branch: string;
  head_sha: string;
  admitted_progress_class: PostResolutionAllowedProgressClass | null;
  retired_boundaries: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const BUILT_IN_REPEAT_CLASSES = new Set<PostResolutionCandidateClass>([
  "metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "guessed_future_ci",
  "reclose_completed_blocker",
  "old_repaired_head_blocker",
]);

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(?:ts|js|mjs|json)$/.test(path);
}

function proofOnlyPath(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function retiredBoundaries(input: PostResolutionProgressGateInput): string[] {
  return [
    ...input.resolved_boundary_ids,
    `repaired-head:${input.repaired_head_sha}`,
    `status-readback-head:${input.last_status_readback_head_sha}`,
  ];
}

function evidence(input: PostResolutionProgressGateInput): string[] {
  return [
    `candidate:${input.candidate.candidate_id}`,
    `progress:${input.candidate.progress_class}`,
    `live-head:${input.live_head_sha}`,
    ...retiredBoundaries(input).map((boundary) => `retired:${boundary}`),
  ];
}

function base(input: PostResolutionProgressGateInput): Pick<
  PostResolutionProgressGateVerdict,
  "branch" | "head_sha" | "retired_boundaries"
> {
  return {
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    retired_boundaries: retiredBoundaries(input),
  };
}

function block(
  input: PostResolutionProgressGateInput,
  action: Exclude<
    PostResolutionProgressGateAction,
    "admit_external_platform_embodiment" | "admit_fresh_status_readback" | "emit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  extraEvidence: string[] = [],
): PostResolutionProgressGateVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    admitted_progress_class: null,
    decisive_evidence: [...evidence(input), ...extraEvidence],
    blockers,
    next_route: nextRoute,
  };
}

function embodimentBlockers(candidate: PostResolutionProgressCandidate): string[] {
  const executableChanges = candidate.changed_files.filter(executablePlatformPath);
  const behaviorChanges = executableChanges.filter((path) => !proofOnlyPath(path));
  const blockers: string[] = [];

  if (!candidate.candidate_id.trim()) blockers.push("post-resolution embodiment candidate has no id");
  if (executableChanges.length === 0) blockers.push("post-resolution embodiment changes no executable platform file");
  if (executableChanges.length > 0 && behaviorChanges.length === 0) {
    blockers.push("post-resolution embodiment is proof-only and has no behavior file");
  }
  if (candidate.executable_artifacts.length === 0) blockers.push("post-resolution embodiment has no executable artifact evidence");
  if (candidate.routing_artifacts.length === 0) blockers.push("post-resolution embodiment has no future-routing evidence");
  if (candidate.proof_artifacts.length === 0) blockers.push("post-resolution embodiment has no proof artifact evidence");

  return blockers;
}

export function gatePostResolutionProgress(
  input: PostResolutionProgressGateInput,
): PostResolutionProgressGateVerdict {
  const candidate = input.candidate;

  if (input.resolved_boundary_ids.length === 0) {
    return block(
      input,
      "block_unresolved_boundary",
      ["post-resolution progress requires at least one resolved boundary id"],
      "resolve the external boundary before retiring repaired-head blockers",
    );
  }

  if (candidate.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`],
      "bind the candidate to the active PR branch before release",
    );
  }

  if (BUILT_IN_REPEAT_CLASSES.has(candidate.progress_class) || input.forbidden_repeat_classes.includes(candidate.progress_class)) {
    return block(
      input,
      "block_repeated_non_progress",
      [`candidate repeats resolved non-progress class: ${candidate.progress_class}`],
      "choose a new executable embodiment, moved-head status readback, or exact external blocker",
    );
  }

  if (candidate.progress_class === "fresh_status_readback") {
    const headMoved = input.live_head_sha !== input.last_status_readback_head_sha;
    const newChecks = candidate.new_current_head_check_ids ?? [];

    if (!headMoved && newChecks.length === 0) {
      return block(
        input,
        "block_stale_status_readback",
        ["fresh status readback requires a moved live head or newly surfaced current-head checks"],
        "write executable embodiment or wait for a changed current-head status surface",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_fresh_status_readback",
      admitted_progress_class: "fresh_status_readback",
      decisive_evidence: [
        ...evidence(input),
        ...(headMoved ? [`head moved from ${input.last_status_readback_head_sha} to ${input.live_head_sha}`] : []),
        ...newChecks.map((checkId) => `new current-head check:${checkId}`),
      ],
      blockers: [],
      next_route: "read only the current live-head status surface; do not revive retired repaired-head blockers",
    };
  }

  if (candidate.progress_class === "exact_external_blocker") {
    const blocker = candidate.blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_incomplete_blocker",
        ["exact external blocker candidate has no blocker text"],
        "name one exact external blocker or choose executable embodiment",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_exact_external_blocker",
      admitted_progress_class: "exact_external_blocker",
      decisive_evidence: [...evidence(input), blocker],
      blockers: [blocker],
      next_route: "remove the named blocker before attempting another post-resolution progress class",
    };
  }

  if (candidate.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_base_head",
      [`candidate base ${candidate.base_head_sha} is not live head ${input.live_head_sha}`],
      "rebase the executable embodiment candidate onto the live PR head before writing",
    );
  }

  const blockers = embodimentBlockers(candidate);
  if (blockers.length > 0) {
    return block(
      input,
      "block_incomplete_embodiment",
      blockers,
      "supply behavior-bearing executable, routing, and proof evidence before writing",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_external_platform_embodiment",
    admitted_progress_class: "external_platform_embodiment",
    decisive_evidence: [
      ...evidence(input),
      ...candidate.changed_files.filter(executablePlatformPath),
      ...candidate.executable_artifacts,
      ...candidate.routing_artifacts,
      ...candidate.proof_artifacts,
    ],
    blockers: [],
    next_route: "commit the admitted executable embodiment, then bind future status claims to the moved head only",
  };
}
