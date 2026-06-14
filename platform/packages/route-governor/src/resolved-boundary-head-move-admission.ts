export type ResolvedBoundaryMoveClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "old_resolved_head_blocker"
  | "duplicate_ci_summary"
  | "metadata_reread"
  | "duplicate_comment"
  | "local_memory_guard";

export type ResolvedBoundaryStatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "no_status_surface";

export type ResolvedBoundaryAdmissionAction =
  | "admit_external_embodiment"
  | "admit_fresh_status_readback"
  | "block_old_resolved_head_reuse"
  | "block_duplicate_or_internal_move"
  | "block_incomplete_external_embodiment";

export interface ResolvedBoundaryExecutableIncrement {
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
}

export interface ResolvedBoundaryHeadMoveAdmissionInput {
  branch: string;
  active_branch: string;
  prompt_resolved_head_sha: string;
  live_head_sha: string;
  last_status_readback_head_sha: string;
  requested_move_class: ResolvedBoundaryMoveClass;
  status_verdict?: ResolvedBoundaryStatusVerdict;
  new_check_run_ids: string[];
  increment?: ResolvedBoundaryExecutableIncrement;
}

export interface ResolvedBoundaryHeadMoveAdmissionVerdict {
  ok: boolean;
  action: ResolvedBoundaryAdmissionAction;
  branch: string;
  live_head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const DUPLICATE_OR_INTERNAL_MOVE_CLASSES = new Set<ResolvedBoundaryMoveClass>([
  "duplicate_ci_summary",
  "metadata_reread",
  "duplicate_comment",
  "local_memory_guard",
]);

function executablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function block(
  input: ResolvedBoundaryHeadMoveAdmissionInput,
  action: Exclude<ResolvedBoundaryAdmissionAction, "admit_external_embodiment" | "admit_fresh_status_readback">,
  blockers: string[],
  nextRoute: string,
): ResolvedBoundaryHeadMoveAdmissionVerdict {
  return {
    ok: false,
    action,
    branch: input.branch,
    live_head_sha: input.live_head_sha,
    decisive_evidence: [],
    blockers,
    next_route: nextRoute,
  };
}

function validateExecutableIncrement(input: ResolvedBoundaryHeadMoveAdmissionInput): string[] {
  const increment = input.increment;
  if (!increment) return ["external embodiment move has no executable increment"];

  const blockers: string[] = [];
  if (!increment.changed_files.some(executablePlatformPath)) {
    blockers.push("external embodiment must change executable platform files under platform/packages");
  }
  if (increment.executable_artifacts.length === 0) {
    blockers.push("external embodiment has no executable artifact evidence");
  }
  if (increment.routing_artifacts.length === 0) {
    blockers.push("external embodiment has no future-routing artifact evidence");
  }
  if (increment.proof_artifacts.length === 0) {
    blockers.push("external embodiment has no proof or test artifact evidence");
  }
  return blockers;
}

export function admitResolvedBoundaryHeadMove(
  input: ResolvedBoundaryHeadMoveAdmissionInput,
): ResolvedBoundaryHeadMoveAdmissionVerdict {
  if (input.branch !== input.active_branch) {
    return block(
      input,
      "block_duplicate_or_internal_move",
      [`active branch ${input.active_branch} does not match target branch ${input.branch}`],
      "bind the finalization move to the active PR branch before claiming progress",
    );
  }

  const promptHeadIsHistorical = input.prompt_resolved_head_sha !== input.live_head_sha;
  const readbackIsStale = input.last_status_readback_head_sha !== input.live_head_sha;

  if (input.requested_move_class === "old_resolved_head_blocker") {
    return block(
      input,
      "block_old_resolved_head_reuse",
      promptHeadIsHistorical
        ? [
            `resolved-head blocker belongs to ${input.prompt_resolved_head_sha}, but live head is ${input.live_head_sha}`,
          ]
        : [`resolved-head blocker is already closed for ${input.prompt_resolved_head_sha}`],
      "do not emit the repaired-head blocker; route through the live head or add executable embodiment",
    );
  }

  if (DUPLICATE_OR_INTERNAL_MOVE_CLASSES.has(input.requested_move_class)) {
    return block(
      input,
      "block_duplicate_or_internal_move",
      [`non-progress move class requested: ${input.requested_move_class}`],
      "choose fresh live-head status readback or executable external embodiment",
    );
  }

  if (input.requested_move_class === "fresh_status_readback") {
    if (!readbackIsStale && input.new_check_run_ids.length === 0) {
      return block(
        input,
        "block_duplicate_or_internal_move",
        ["fresh status readback requires a moved head or new current-head checks"],
        "change executable behavior or wait for a new current-head status surface",
      );
    }

    return {
      ok: true,
      action: "admit_fresh_status_readback",
      branch: input.branch,
      live_head_sha: input.live_head_sha,
      decisive_evidence: [
        ...(readbackIsStale
          ? [`status readback moved from ${input.last_status_readback_head_sha} to ${input.live_head_sha}`]
          : []),
        ...input.new_check_run_ids.map((id) => `new current-head check run ${id}`),
      ],
      blockers: [],
      next_route: "read only checks bound to the live PR head before making a status claim",
    };
  }

  const blockers = validateExecutableIncrement(input);
  if (blockers.length > 0) {
    return block(
      input,
      "block_incomplete_external_embodiment",
      blockers,
      "supply an executable platform increment with routing and proof artifacts",
    );
  }

  const increment = input.increment;
  if (!increment) {
    return block(
      input,
      "block_incomplete_external_embodiment",
      ["external embodiment move has no executable increment"],
      "supply an executable platform increment with routing and proof artifacts",
    );
  }

  return {
    ok: true,
    action: "admit_external_embodiment",
    branch: input.branch,
    live_head_sha: input.live_head_sha,
    decisive_evidence: [
      ...(promptHeadIsHistorical ? [`prompt resolved head preserved as historical: ${input.prompt_resolved_head_sha}`] : []),
      ...(readbackIsStale ? [`last readback head is stale: ${input.last_status_readback_head_sha}`] : []),
      ...(input.status_verdict ? [`status verdict carried without pass/fail claim: ${input.status_verdict}`] : []),
      ...increment.changed_files.filter(executablePlatformPath),
      ...increment.executable_artifacts,
      ...increment.routing_artifacts,
      ...increment.proof_artifacts,
    ],
    blockers: [],
    next_route: "after the branch moves, bind any status claim to the resulting live head only",
  };
}
