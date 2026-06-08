export type FinalizationProgressMoveClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "metadata_reread"
  | "duplicate_ci_summary"
  | "duplicate_comment"
  | "duplicate_label"
  | "local_memory_guard"
  | "guessed_future_ci"
  | "reclose_completed_blocker"
  | "old_repaired_head_blocker";

export type FinalizationProgressAction =
  | "commit_executable_embodiment"
  | "read_live_head_status"
  | "emit_exact_external_blocker"
  | "block_non_progress"
  | "block_incomplete_progress";

export interface FinalizationStatusSurfaceRef {
  head_sha: string;
  evidence_ids: string[];
}

export interface FinalizationProgressInput {
  branch: string;
  active_branch: string;
  prompt_head_sha: string;
  live_head_sha: string;
  last_status_readback_head_sha: string;
  resolved_repaired_head_sha: string;
  resolved_repaired_head_succeeded: boolean;
  move_class: FinalizationProgressMoveClass;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  artifact_class?: string;
  spent_artifact_classes: string[];
  new_current_head_check_ids: string[];
  status_surface?: FinalizationStatusSurfaceRef;
  exact_blocker?: string;
  prohibited_blockers: string[];
}

export interface FinalizationProgressVerdict {
  ok: boolean;
  action: FinalizationProgressAction;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_CLASSES = new Set<FinalizationProgressMoveClass>([
  "metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "guessed_future_ci",
  "reclose_completed_blocker",
  "old_repaired_head_blocker",
]);

function isExecutablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function base(input: FinalizationProgressInput): Pick<FinalizationProgressVerdict, "branch" | "head_sha"> {
  return { branch: input.branch, head_sha: input.live_head_sha };
}

function block(
  input: FinalizationProgressInput,
  action: Extract<FinalizationProgressAction, "block_non_progress" | "block_incomplete_progress">,
  blockers: string[],
  nextRoute: string,
): FinalizationProgressVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: [],
    blockers,
    next_route: nextRoute,
  };
}

function exactBlockerIsProhibited(input: FinalizationProgressInput): string | null {
  const blocker = input.exact_blocker?.trim();
  if (!blocker) return null;
  return input.prohibited_blockers.find((prohibited) => prohibited === blocker) ?? null;
}

function headMovedSinceLastReadback(input: FinalizationProgressInput): boolean {
  return input.live_head_sha !== input.last_status_readback_head_sha;
}

function promptHeadIsResolvedRepair(input: FinalizationProgressInput): boolean {
  return (
    input.resolved_repaired_head_succeeded &&
    input.prompt_head_sha === input.resolved_repaired_head_sha
  );
}

function embodimentBlockers(input: FinalizationProgressInput): string[] {
  const blockers: string[] = [];

  if (!input.changed_files.some(isExecutablePlatformPath)) {
    blockers.push("external embodiment does not change executable platform files");
  }
  if (input.executable_artifacts.length === 0) {
    blockers.push("external embodiment has no executable artifact");
  }
  if (input.routing_artifacts.length === 0) {
    blockers.push("external embodiment has no future-routing artifact");
  }
  if (input.artifact_class && input.spent_artifact_classes.includes(input.artifact_class)) {
    blockers.push(`external embodiment repeats spent artifact class: ${input.artifact_class}`);
  }

  return blockers;
}

export function compileFinalizationProgressContract(input: FinalizationProgressInput): FinalizationProgressVerdict {
  if (input.branch !== input.active_branch) {
    return block(
      input,
      "block_incomplete_progress",
      [`finalization branch ${input.branch} does not match active branch ${input.active_branch}`],
      "rebind the move to the active PR branch before release",
    );
  }

  const prohibitedBlocker = exactBlockerIsProhibited(input);
  if (prohibitedBlocker) {
    return block(
      input,
      "block_non_progress",
      [`prohibited blocker cannot be emitted: ${prohibitedBlocker}`],
      "discard the old repaired-head blocker and route through live-head progress classes",
    );
  }

  if (NON_PROGRESS_CLASSES.has(input.move_class)) {
    return block(
      input,
      "block_non_progress",
      [`move class is explicitly non-progress: ${input.move_class}`],
      "choose executable embodiment, fresh live-head readback, or one exact external blocker",
    );
  }

  if (input.status_surface && input.status_surface.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_incomplete_progress",
      [`status surface belongs to ${input.status_surface.head_sha}, not live head ${input.live_head_sha}`],
      "obtain status evidence bound to the live PR head",
    );
  }

  if (input.move_class === "fresh_status_readback") {
    if (!headMovedSinceLastReadback(input) && input.new_current_head_check_ids.length === 0) {
      return block(
        input,
        "block_non_progress",
        ["fresh status readback requires a moved PR head or new current-head checks"],
        "wait for a moved head or new current-head check evidence before claiming readback progress",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "read_live_head_status",
      decisive_evidence: [
        ...(headMovedSinceLastReadback(input)
          ? [`head moved from ${input.last_status_readback_head_sha} to ${input.live_head_sha}`]
          : []),
        ...input.new_current_head_check_ids.map((id) => `new current-head check ${id}`),
        ...(input.status_surface?.evidence_ids ?? []),
      ],
      blockers: [],
      next_route: "publish only a live-head status readback, then require a non-repeated next move",
    };
  }

  if (input.move_class === "exact_external_blocker") {
    const blocker = input.exact_blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_incomplete_progress",
        ["exact external blocker move has no blocker text"],
        "name the exact external blocker or choose executable embodiment",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_exact_external_blocker",
      decisive_evidence: [blocker],
      blockers: [blocker],
      next_route: "remove the named blocker before attempting another progress class",
    };
  }

  const blockers = embodimentBlockers(input);
  if (blockers.length > 0) {
    return block(
      input,
      "block_incomplete_progress",
      blockers,
      "raise the embodiment candidate to executable platform behavior and future routing evidence",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "commit_executable_embodiment",
    decisive_evidence: [
      ...(promptHeadIsResolvedRepair(input) && input.live_head_sha !== input.prompt_head_sha
        ? [`live head ${input.live_head_sha} supersedes resolved repaired head ${input.prompt_head_sha}`]
        : []),
      ...input.changed_files,
      ...input.executable_artifacts,
      ...input.routing_artifacts,
    ],
    blockers: [],
    next_route: "after the branch moves, read only status surfaces bound to the new PR head",
  };
}
