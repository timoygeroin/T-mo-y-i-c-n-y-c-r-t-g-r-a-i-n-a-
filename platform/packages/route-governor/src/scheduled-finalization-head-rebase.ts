export type ScheduledFinalizationMoveClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "metadata_reread"
  | "duplicate_ci_summary"
  | "replayed_repaired_head_blocker";

export type ScheduledFinalizationHeadRebaseAction =
  | "admit_live_head_external_embodiment"
  | "admit_live_head_status_readback"
  | "admit_live_head_blocker"
  | "block_stale_prompt_head"
  | "block_replayed_repaired_head_blocker"
  | "block_non_progress_move"
  | "block_incomplete_external_embodiment"
  | "block_incomplete_status_readback"
  | "block_branch_mismatch";

export interface ScheduledFinalizationCandidate {
  move_class: ScheduledFinalizationMoveClass;
  base_head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  status_surface_ids: string[];
  blocker?: string;
}

export interface ScheduledFinalizationHeadRebaseInput {
  active_branch: string;
  pr_branch: string;
  prompt_head_sha: string;
  live_head_sha: string;
  last_repaired_head_sha: string;
  repaired_head_status_resolved: boolean;
  blocker_issue_closed: boolean;
  blocker_label_present: boolean;
  candidate: ScheduledFinalizationCandidate;
}

export interface ScheduledFinalizationHeadRebaseVerdict {
  ok: boolean;
  action: ScheduledFinalizationHeadRebaseAction;
  branch: string;
  admitted_head_sha: string;
  quarantined_head_shas: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_MOVE_CLASSES = new Set<ScheduledFinalizationMoveClass>([
  "metadata_reread",
  "duplicate_ci_summary",
  "replayed_repaired_head_blocker",
]);

function executablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function base(input: ScheduledFinalizationHeadRebaseInput): Pick<
  ScheduledFinalizationHeadRebaseVerdict,
  "branch" | "admitted_head_sha"
> {
  return {
    branch: input.pr_branch,
    admitted_head_sha: input.live_head_sha,
  };
}

function block(
  input: ScheduledFinalizationHeadRebaseInput,
  action: Exclude<
    ScheduledFinalizationHeadRebaseAction,
    "admit_live_head_external_embodiment" | "admit_live_head_status_readback" | "admit_live_head_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  quarantinedHeadShas: string[] = [],
): ScheduledFinalizationHeadRebaseVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    quarantined_head_shas: quarantinedHeadShas,
    decisive_evidence: [],
    blockers,
    next_route: nextRoute,
  };
}

function repairedHeadBlockerIsResolved(input: ScheduledFinalizationHeadRebaseInput): boolean {
  return input.repaired_head_status_resolved && input.blocker_issue_closed && !input.blocker_label_present;
}

export function rebaseScheduledFinalizationToLiveHead(
  input: ScheduledFinalizationHeadRebaseInput,
): ScheduledFinalizationHeadRebaseVerdict {
  if (input.pr_branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`PR branch ${input.pr_branch} does not match active branch ${input.active_branch}`],
      "bind scheduled finalization to the active manifestation branch before choosing a move",
    );
  }

  if (
    input.candidate.move_class === "replayed_repaired_head_blocker" ||
    (input.candidate.blocker?.includes(input.last_repaired_head_sha) && repairedHeadBlockerIsResolved(input))
  ) {
    return block(
      input,
      "block_replayed_repaired_head_blocker",
      [`resolved repaired-head blocker cannot be replayed for ${input.last_repaired_head_sha}`],
      "route from the live PR head; the repaired-head blocker remains historical only",
      [input.last_repaired_head_sha],
    );
  }

  if (NON_PROGRESS_MOVE_CLASSES.has(input.candidate.move_class)) {
    return block(
      input,
      "block_non_progress_move",
      [`scheduled finalization requested non-progress move class: ${input.candidate.move_class}`],
      "choose external embodiment, fresh live-head readback, or one exact live-head blocker",
    );
  }

  const promptHeadIsStale = input.prompt_head_sha !== input.live_head_sha;
  const baseHeadIsLive = input.candidate.base_head_sha === input.live_head_sha;

  if (promptHeadIsStale && !baseHeadIsLive) {
    return block(
      input,
      "block_stale_prompt_head",
      [`candidate base ${input.candidate.base_head_sha} is not live head ${input.live_head_sha}`],
      "rebase the scheduled finalization move to the live PR head before release",
      [input.prompt_head_sha],
    );
  }

  if (input.candidate.move_class === "fresh_status_readback") {
    if (input.candidate.status_surface_ids.length === 0) {
      return block(
        input,
        "block_incomplete_status_readback",
        ["fresh status readback has no live-head status surface id"],
        "attach a status surface for the live PR head before counting readback progress",
        promptHeadIsStale ? [input.prompt_head_sha] : [],
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_live_head_status_readback",
      quarantined_head_shas: promptHeadIsStale ? [input.prompt_head_sha] : [],
      decisive_evidence: [
        `live head ${input.live_head_sha}`,
        ...input.candidate.status_surface_ids,
        ...(promptHeadIsStale ? [`quarantined prompt head ${input.prompt_head_sha}`] : []),
      ],
      blockers: [],
      next_route: "use the live-head status verdict to choose the next non-repeated embodiment or blocker",
    };
  }

  if (input.candidate.move_class === "external_platform_embodiment") {
    const blockers: string[] = [];
    if (!input.candidate.changed_files.some(executablePlatformPath)) {
      blockers.push("external embodiment has no executable platform file change");
    }
    if (input.candidate.executable_artifacts.length === 0) blockers.push("external embodiment has no executable artifact");
    if (input.candidate.routing_artifacts.length === 0) blockers.push("external embodiment has no future-routing artifact");

    if (blockers.length > 0) {
      return block(
        input,
        "block_incomplete_external_embodiment",
        blockers,
        "supply an executable platform embodiment bound to the live PR head",
        promptHeadIsStale ? [input.prompt_head_sha] : [],
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_live_head_external_embodiment",
      quarantined_head_shas: promptHeadIsStale ? [input.prompt_head_sha] : [],
      decisive_evidence: [
        `live head ${input.live_head_sha}`,
        ...input.candidate.changed_files.filter(executablePlatformPath),
        ...input.candidate.executable_artifacts,
        ...input.candidate.routing_artifacts,
        ...(promptHeadIsStale ? [`quarantined prompt head ${input.prompt_head_sha}`] : []),
      ],
      blockers: [],
      next_route: "commit the live-head embodiment, then read status only for the moved head",
    };
  }

  if (!input.candidate.blocker?.trim()) {
    return block(
      input,
      "block_incomplete_external_embodiment",
      ["exact external blocker candidate has no blocker text"],
      "name the exact live-head blocker or choose a stronger admissible move",
      promptHeadIsStale ? [input.prompt_head_sha] : [],
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_live_head_blocker",
    quarantined_head_shas: promptHeadIsStale ? [input.prompt_head_sha] : [],
    decisive_evidence: [
      `live head ${input.live_head_sha}`,
      input.candidate.blocker,
      ...(promptHeadIsStale ? [`quarantined prompt head ${input.prompt_head_sha}`] : []),
    ],
    blockers: [input.candidate.blocker],
    next_route: "resolve the exact live-head blocker before attempting another progress class",
  };
}
