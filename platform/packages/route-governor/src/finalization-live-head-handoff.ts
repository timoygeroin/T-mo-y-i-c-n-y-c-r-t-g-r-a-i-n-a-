export type LiveHeadHandoffAction =
  | "continue_from_live_head"
  | "read_live_head_status"
  | "block_repaired_head_resurrection"
  | "block_missing_external_increment";

export type LiveHeadHandoffMoveClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "duplicate_ci_summary"
  | "metadata_reread"
  | "local_memory_guard"
  | "repaired_head_blocker";

export interface LiveHeadFinalizationHandoffInput {
  branch: string;
  active_branch: string;
  prompt_head_sha: string;
  live_head_sha: string;
  resolved_repaired_head_sha: string;
  resolved_repaired_head_status_readback: boolean;
  move_class: LiveHeadHandoffMoveClass;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  status_surface_ids: string[];
}

export interface LiveHeadFinalizationHandoffVerdict {
  ok: boolean;
  action: LiveHeadHandoffAction;
  branch: string;
  live_head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_MOVE_CLASSES = new Set<LiveHeadHandoffMoveClass>([
  "duplicate_ci_summary",
  "metadata_reread",
  "local_memory_guard",
  "repaired_head_blocker",
]);

function executablePlatformFile(path: string): boolean {
  return path.startsWith("platform/packages/") && (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs"));
}

function block(
  input: LiveHeadFinalizationHandoffInput,
  action: LiveHeadHandoffAction,
  blockers: string[],
  nextRoute: string,
): LiveHeadFinalizationHandoffVerdict {
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

export function compileLiveHeadFinalizationHandoff(
  input: LiveHeadFinalizationHandoffInput,
): LiveHeadFinalizationHandoffVerdict {
  if (input.branch !== input.active_branch) {
    return block(
      input,
      "block_missing_external_increment",
      [`branch ${input.branch} does not match active branch ${input.active_branch}`],
      "rebind finalization to the active PR branch before release",
    );
  }

  const promptHeadWasResolved =
    input.resolved_repaired_head_status_readback && input.prompt_head_sha === input.resolved_repaired_head_sha;
  const liveHeadMovedPastPrompt = input.live_head_sha !== input.prompt_head_sha;

  if (input.move_class === "repaired_head_blocker" && promptHeadWasResolved) {
    return block(
      input,
      "block_repaired_head_resurrection",
      [`repaired-head blocker for ${input.resolved_repaired_head_sha} is already resolved`],
      "discard the repaired-head blocker and bind the run to the live PR head",
    );
  }

  if (NON_PROGRESS_MOVE_CLASSES.has(input.move_class)) {
    return block(
      input,
      "block_missing_external_increment",
      [`move class is non-progress for Loading 20 continuation: ${input.move_class}`],
      "choose executable platform embodiment, live-head status readback, or one exact external blocker",
    );
  }

  if (input.move_class === "fresh_status_readback") {
    if (!liveHeadMovedPastPrompt && input.status_surface_ids.length === 0) {
      return block(
        input,
        "block_missing_external_increment",
        ["fresh readback requires a moved live head or new status surface ids"],
        "wait for a head move/new checks or choose executable embodiment",
      );
    }

    return {
      ok: true,
      action: "read_live_head_status",
      branch: input.branch,
      live_head_sha: input.live_head_sha,
      decisive_evidence: [
        ...(liveHeadMovedPastPrompt ? [`live head moved from ${input.prompt_head_sha} to ${input.live_head_sha}`] : []),
        ...input.status_surface_ids.map((id) => `current-head status surface ${id}`),
      ],
      blockers: [],
      next_route: "publish only status evidence bound to the live PR head, then continue with a non-repeated executable embodiment",
    };
  }

  const hasExecutableFile = input.changed_files.some(executablePlatformFile);
  const hasExecutableArtifact = input.executable_artifacts.length > 0;
  const hasRoutingArtifact = input.routing_artifacts.length > 0;

  if (input.move_class === "external_platform_embodiment" && hasExecutableFile && hasExecutableArtifact && hasRoutingArtifact) {
    return {
      ok: true,
      action: "continue_from_live_head",
      branch: input.branch,
      live_head_sha: input.live_head_sha,
      decisive_evidence: [
        ...(liveHeadMovedPastPrompt ? [`live head supersedes prompt head ${input.prompt_head_sha}`] : []),
        ...input.changed_files,
        ...input.executable_artifacts,
        ...input.routing_artifacts,
      ],
      blockers: [],
      next_route: "after this branch-moving embodiment, require a fresh status surface bound to the new PR head before any pass/fail claim",
    };
  }

  return block(
    input,
    "block_missing_external_increment",
    ["external embodiment lacks executable platform file, executable artifact, or future-routing artifact"],
    "commit a real executable platform increment or emit one exact external blocker",
  );
}
