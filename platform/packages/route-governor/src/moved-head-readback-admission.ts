export type MovedHeadReadbackMoveClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "repaired_head_replay"
  | "metadata_reread"
  | "duplicate_ci_summary";

export type MovedHeadStatusVerdict = "passing" | "passing_with_warnings" | "failing" | "pending" | "no_status_surface";

export type MovedHeadReadbackAdmissionAction =
  | "admit_moved_head_status_readback"
  | "admit_moved_head_embodiment"
  | "emit_moved_head_log_blocker"
  | "emit_moved_head_external_blocker"
  | "block_branch_mismatch"
  | "block_repaired_head_replay"
  | "block_non_progress_move"
  | "block_stale_candidate_base"
  | "block_missing_status_surface"
  | "block_incomplete_embodiment"
  | "block_incomplete_blocker";

export interface MovedHeadStatusSurface {
  surface_id: string;
  head_sha: string;
  verdict: MovedHeadStatusVerdict;
  log_detail_available: boolean;
  failure_signature?: string;
}

export interface MovedHeadReadbackCandidate {
  move_class: MovedHeadReadbackMoveClass;
  base_head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  status_surfaces: MovedHeadStatusSurface[];
  blocker?: string;
}

export interface MovedHeadReadbackAdmissionInput {
  active_branch: string;
  pr_branch: string;
  prompt_head_sha: string;
  live_head_sha: string;
  repaired_head_sha: string;
  repaired_head_status_resolved: boolean;
  candidate: MovedHeadReadbackCandidate;
}

export interface MovedHeadReadbackAdmissionVerdict {
  ok: boolean;
  action: MovedHeadReadbackAdmissionAction;
  branch: string;
  admitted_head_sha: string;
  quarantined_head_shas: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_MOVE_CLASSES = new Set<MovedHeadReadbackMoveClass>(["metadata_reread", "duplicate_ci_summary"]);

function executablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function quarantinedPromptHead(input: MovedHeadReadbackAdmissionInput): string[] {
  return input.prompt_head_sha === input.live_head_sha ? [] : [input.prompt_head_sha];
}

function base(input: MovedHeadReadbackAdmissionInput): Pick<
  MovedHeadReadbackAdmissionVerdict,
  "branch" | "admitted_head_sha" | "quarantined_head_shas"
> {
  return {
    branch: input.pr_branch,
    admitted_head_sha: input.live_head_sha,
    quarantined_head_shas: quarantinedPromptHead(input),
  };
}

function block(
  input: MovedHeadReadbackAdmissionInput,
  action: Exclude<
    MovedHeadReadbackAdmissionAction,
    "admit_moved_head_status_readback" | "admit_moved_head_embodiment" | "emit_moved_head_log_blocker" | "emit_moved_head_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
): MovedHeadReadbackAdmissionVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: [],
    blockers,
    next_route: nextRoute,
  };
}

function currentHeadSurfaces(input: MovedHeadReadbackAdmissionInput): MovedHeadStatusSurface[] {
  return input.candidate.status_surfaces.filter((surface) => surface.head_sha === input.live_head_sha);
}

function incompleteEmbodiment(candidate: MovedHeadReadbackCandidate): string[] {
  const blockers: string[] = [];

  if (!candidate.changed_files.some(executablePlatformPath)) {
    blockers.push("moved-head embodiment changes no executable platform file");
  }
  if (candidate.executable_artifacts.length === 0) blockers.push("moved-head embodiment has no executable artifact");
  if (candidate.routing_artifacts.length === 0) blockers.push("moved-head embodiment has no future-routing artifact");

  return blockers;
}

function isResolvedRepairedHeadReplay(input: MovedHeadReadbackAdmissionInput): boolean {
  const blocker = input.candidate.blocker ?? "";
  return (
    input.repaired_head_status_resolved &&
    (input.candidate.move_class === "repaired_head_replay" ||
      input.candidate.base_head_sha === input.repaired_head_sha ||
      blocker.includes(input.repaired_head_sha))
  );
}

export function compileMovedHeadReadbackAdmission(
  input: MovedHeadReadbackAdmissionInput,
): MovedHeadReadbackAdmissionVerdict {
  if (input.pr_branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`PR branch ${input.pr_branch} does not match active branch ${input.active_branch}`],
      "bind moved-head admission to the active manifestation branch before release",
    );
  }

  if (isResolvedRepairedHeadReplay(input)) {
    return block(
      input,
      "block_repaired_head_replay",
      [`resolved repaired head cannot be reused as current progress: ${input.repaired_head_sha}`],
      "quarantine the repaired head as historical and route only from the live moved head",
    );
  }

  if (NON_PROGRESS_MOVE_CLASSES.has(input.candidate.move_class)) {
    return block(
      input,
      "block_non_progress_move",
      [`moved-head admission requested non-progress move class: ${input.candidate.move_class}`],
      "choose live-head status readback, executable embodiment, or one exact live-head blocker",
    );
  }

  if (input.candidate.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_candidate_base",
      [`candidate base ${input.candidate.base_head_sha} is not live PR head ${input.live_head_sha}`],
      "rebase the candidate to the live moved PR head before release",
    );
  }

  if (input.candidate.move_class === "fresh_status_readback") {
    const surfaces = currentHeadSurfaces(input);
    if (surfaces.length === 0) {
      return block(
        input,
        "block_missing_status_surface",
        [`no status surface is bound to live PR head ${input.live_head_sha}`],
        "obtain a status surface for the live moved head before claiming readback progress",
      );
    }

    const failingWithoutLog = surfaces.find((surface) => surface.verdict === "failing" && !surface.log_detail_available);
    if (failingWithoutLog) {
      const blocker = `CURRENT_HEAD_FAILURE_LOG_SURFACE_INSUFFICIENT: live head ${input.live_head_sha} has failing surface ${failingWithoutLog.surface_id} without a concrete failure signature`;
      return {
        ...base(input),
        ok: false,
        action: "emit_moved_head_log_blocker",
        decisive_evidence: [failingWithoutLog.surface_id, `live head ${input.live_head_sha}`],
        blockers: [blocker],
        next_route: "obtain signed Actions logs, proof output artifact, step summary, or another failure-detail surface for the live moved head",
      };
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_moved_head_status_readback",
      decisive_evidence: surfaces.map((surface) => `${surface.surface_id}: ${surface.verdict}`),
      blockers: surfaces
        .filter((surface) => surface.verdict === "failing")
        .map((surface) => surface.failure_signature ?? `failing live-head status surface: ${surface.surface_id}`),
      next_route: "use this live-head readback to choose repair, embodiment, or exact blocker without reusing repaired-head history",
    };
  }

  if (input.candidate.move_class === "external_platform_embodiment") {
    const blockers = incompleteEmbodiment(input.candidate);
    if (blockers.length > 0) {
      return block(
        input,
        "block_incomplete_embodiment",
        blockers,
        "complete executable and routing evidence before moving the branch head",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_moved_head_embodiment",
      decisive_evidence: [
        `live head ${input.live_head_sha}`,
        ...input.candidate.changed_files.filter(executablePlatformPath),
        ...input.candidate.executable_artifacts,
        ...input.candidate.routing_artifacts,
      ],
      blockers: [],
      next_route: "commit the moved-head embodiment, then require status readback for the new head",
    };
  }

  if (!input.candidate.blocker?.includes(input.live_head_sha)) {
    return block(
      input,
      "block_incomplete_blocker",
      ["exact external blocker is not bound to the live moved head"],
      "name one exact blocker that includes the live PR head it blocks",
    );
  }

  return {
    ...base(input),
    ok: false,
    action: "emit_moved_head_external_blocker",
    decisive_evidence: [`live head ${input.live_head_sha}`, input.candidate.blocker],
    blockers: [input.candidate.blocker],
    next_route: "clear the live-head blocker before choosing another progress class",
  };
}
