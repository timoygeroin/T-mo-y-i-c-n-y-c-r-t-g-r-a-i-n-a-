export type ScheduledFinalizationMoveClass =
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
  | "duplicate_status_readback"
  | "old_repaired_head_blocker";

export type ScheduledFinalizationAction =
  | "commit_external_embodiment"
  | "read_live_head_status"
  | "emit_exact_external_blocker"
  | "repair_live_head_failure"
  | "wait_for_live_head_checks"
  | "block_non_progress"
  | "block_incomplete_progress";

export interface ScheduledFinalizationStatusSurface {
  head_sha: string;
  verdict: "passing" | "passing_with_warnings" | "pending" | "failing" | "no_status_surface";
  evidence_ids: string[];
  blockers: string[];
  warnings: string[];
}

export interface ScheduledFinalizationInput {
  branch: string;
  active_branch: string;
  prompt_head_sha: string;
  live_head_sha: string;
  resolved_repaired_head_sha: string;
  resolved_repaired_head_status: boolean;
  move_class: ScheduledFinalizationMoveClass;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  prohibited_blockers: string[];
  attempted_blocker?: string;
  live_status_surface?: ScheduledFinalizationStatusSurface;
}

export interface ScheduledFinalizationVerdict {
  ok: boolean;
  action: ScheduledFinalizationAction;
  branch: string;
  head_sha: string;
  prompt_head_allowed: boolean;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

const NON_PROGRESS_CLASSES = new Set<ScheduledFinalizationMoveClass>([
  "metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "guessed_future_ci",
  "reclose_completed_blocker",
  "duplicate_status_readback",
  "old_repaired_head_blocker",
]);

function isExecutablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function attemptedProhibitedBlocker(input: ScheduledFinalizationInput): string | null {
  const attempted = input.attempted_blocker?.trim();
  if (!attempted) return null;
  return input.prohibited_blockers.find((blocker) => blocker === attempted) ?? null;
}

function embodimentIsExecutable(input: ScheduledFinalizationInput): boolean {
  return (
    input.changed_files.some(isExecutablePlatformPath) &&
    input.executable_artifacts.length > 0 &&
    input.routing_artifacts.length > 0
  );
}

function base(input: ScheduledFinalizationInput): Pick<ScheduledFinalizationVerdict, "branch" | "head_sha" | "warnings"> {
  return {
    branch: input.branch,
    head_sha: input.live_head_sha,
    warnings: input.live_status_surface?.warnings ?? [],
  };
}

function block(
  input: ScheduledFinalizationInput,
  action: Extract<ScheduledFinalizationAction, "block_non_progress" | "block_incomplete_progress">,
  blockers: string[],
  nextRoute: string,
): ScheduledFinalizationVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    prompt_head_allowed: false,
    decisive_evidence: [],
    blockers,
    next_route: nextRoute,
  };
}

function statusAllowsContinuation(surface: ScheduledFinalizationStatusSurface): boolean {
  return surface.verdict === "passing" || surface.verdict === "passing_with_warnings";
}

export function routeScheduledFinalization(input: ScheduledFinalizationInput): ScheduledFinalizationVerdict {
  if (input.branch !== input.active_branch) {
    return block(
      input,
      "block_incomplete_progress",
      [`scheduled finalization branch ${input.branch} does not match active branch ${input.active_branch}`],
      "rebind the scheduled run to the active PR branch before release",
    );
  }

  const prohibited = attemptedProhibitedBlocker(input);
  if (prohibited) {
    return block(
      input,
      "block_non_progress",
      [`prohibited repaired-head blocker cannot be emitted: ${prohibited}`],
      "discard the repaired-head blocker and route through the live PR head",
    );
  }

  if (NON_PROGRESS_CLASSES.has(input.move_class)) {
    return block(
      input,
      "block_non_progress",
      [`scheduled finalization move is explicitly non-progress: ${input.move_class}`],
      "select executable embodiment, live-head status readback, or one exact live-head blocker",
    );
  }

  const promptHeadIsLive = input.prompt_head_sha === input.live_head_sha;
  const repairedHeadResolved =
    input.resolved_repaired_head_status && input.resolved_repaired_head_sha === input.prompt_head_sha;
  const surface = input.live_status_surface;

  if (surface && surface.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_incomplete_progress",
      [`status surface belongs to ${surface.head_sha}, not live PR head ${input.live_head_sha}`],
      "obtain a status surface bound to the live PR head",
    );
  }

  if (input.move_class === "fresh_status_readback") {
    if (!promptHeadIsLive && !surface) {
      return {
        ...base(input),
        ok: true,
        action: "read_live_head_status",
        prompt_head_allowed: false,
        decisive_evidence: [`PR head moved from prompt-carried ${input.prompt_head_sha} to live ${input.live_head_sha}`],
        blockers: [],
        next_route: "read status surfaces bound to the live PR head before making any pass/fail claim",
      };
    }

    if (!surface) {
      return block(
        input,
        "block_incomplete_progress",
        ["fresh status readback has no live-head status surface"],
        "attach live-head check or workflow evidence before publishing a status readback",
      );
    }

    if (surface.verdict === "pending") {
      return {
        ...base(input),
        ok: false,
        action: "wait_for_live_head_checks",
        prompt_head_allowed: false,
        decisive_evidence: surface.evidence_ids,
        blockers: surface.blockers,
        next_route: "wait for live-head checks to complete before release",
      };
    }

    if (!statusAllowsContinuation(surface)) {
      return {
        ...base(input),
        ok: false,
        action: "repair_live_head_failure",
        prompt_head_allowed: false,
        decisive_evidence: [...surface.evidence_ids, ...surface.blockers],
        blockers: surface.blockers.length > 0 ? surface.blockers : [`live-head status is ${surface.verdict}`],
        next_route: "repair the concrete live-head failure before any embodiment increment",
      };
    }

    return {
      ...base(input),
      ok: true,
      action: "read_live_head_status",
      prompt_head_allowed: promptHeadIsLive && repairedHeadResolved,
      decisive_evidence: surface.evidence_ids,
      blockers: [],
      next_route: "continue from the live head with a non-repeated executable embodiment class",
    };
  }

  if (input.move_class === "exact_external_blocker") {
    const blocker = input.attempted_blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_incomplete_progress",
        ["exact external blocker move has no blocker text"],
        "name one exact live-head blocker or choose executable embodiment",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_exact_external_blocker",
      prompt_head_allowed: promptHeadIsLive && repairedHeadResolved,
      decisive_evidence: [blocker],
      blockers: [blocker],
      next_route: "remove the named blocker before attempting another progress class",
    };
  }

  if (!embodimentIsExecutable(input)) {
    return block(
      input,
      "block_incomplete_progress",
      ["scheduled finalization embodiment lacks executable platform change or future-routing artifact"],
      "raise the scheduled move to executable behavior plus routing evidence",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "commit_external_embodiment",
    prompt_head_allowed: promptHeadIsLive && repairedHeadResolved,
    decisive_evidence: [
      ...(promptHeadIsLive ? [] : [`live PR head supersedes prompt-carried head ${input.prompt_head_sha}`]),
      ...input.changed_files,
      ...input.executable_artifacts,
      ...input.routing_artifacts,
    ],
    blockers: [],
    next_route: "after this embodiment moves the branch, read only status surfaces bound to the new PR head",
  };
}
