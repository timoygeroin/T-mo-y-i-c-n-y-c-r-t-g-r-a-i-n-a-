export type ScheduledLiveHeadMoveClass =
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

export type ScheduledLiveHeadAction =
  | "admit_external_embodiment"
  | "admit_fresh_status_readback"
  | "admit_exact_blocker"
  | "block_stale_repaired_head"
  | "block_non_progress";

export interface ScheduledLiveHeadCandidate {
  candidate_id: string;
  move_class: ScheduledLiveHeadMoveClass;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  exact_blocker?: string;
}

export interface ScheduledLiveHeadAdmissionInput {
  active_branch: string;
  candidate_branch: string;
  live_head_sha: string;
  prompt_carried_head_sha: string;
  resolved_repaired_head_sha: string;
  current_head_check_run_ids: string[];
  candidate: ScheduledLiveHeadCandidate;
}

export interface ScheduledLiveHeadAdmissionVerdict {
  ok: boolean;
  action: ScheduledLiveHeadAction;
  branch: string;
  live_head_sha: string;
  prompt_carried_head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_CLASSES = new Set<ScheduledLiveHeadMoveClass>([
  "metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "guessed_future_ci",
  "reclose_completed_blocker",
]);

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function embodimentFailures(candidate: ScheduledLiveHeadCandidate): string[] {
  const failures: string[] = [];

  if (!candidate.changed_files.some(executablePlatformPath)) {
    failures.push("scheduled embodiment must change an executable platform package file");
  }
  if (candidate.executable_artifacts.length === 0) {
    failures.push("scheduled embodiment must name executable artifacts");
  }
  if (candidate.routing_artifacts.length === 0) {
    failures.push("scheduled embodiment must name future-routing artifacts");
  }
  if (candidate.proof_artifacts.length === 0) {
    failures.push("scheduled embodiment must name proof artifacts");
  }

  return failures;
}

export function compileScheduledLiveHeadAdmission(
  input: ScheduledLiveHeadAdmissionInput,
): ScheduledLiveHeadAdmissionVerdict {
  const base = {
    branch: input.candidate_branch,
    live_head_sha: input.live_head_sha,
    prompt_carried_head_sha: input.prompt_carried_head_sha,
  };
  const headMovedFromPrompt = input.live_head_sha !== input.prompt_carried_head_sha;

  if (input.candidate_branch !== input.active_branch) {
    return {
      ...base,
      ok: false,
      action: "block_non_progress",
      decisive_evidence: [],
      blockers: [`candidate branch ${input.candidate_branch} does not match active branch ${input.active_branch}`],
      next_route: "bind the scheduled finalization move to the active PR branch",
    };
  }

  if (input.candidate.move_class === "old_repaired_head_blocker") {
    return {
      ...base,
      ok: false,
      action: "block_stale_repaired_head",
      decisive_evidence: [
        `repaired head ${input.resolved_repaired_head_sha} is resolved`,
        `live head ${input.live_head_sha}`,
      ],
      blockers: headMovedFromPrompt
        ? [`prompt-carried repaired head ${input.prompt_carried_head_sha} is not the live PR head`]
        : [`repaired-head blocker for ${input.resolved_repaired_head_sha} is already resolved`],
      next_route: headMovedFromPrompt
        ? "use the live moved head for fresh status readback or a new executable embodiment"
        : "choose a new executable embodiment or a different exact external blocker",
    };
  }

  if (NON_PROGRESS_CLASSES.has(input.candidate.move_class)) {
    return {
      ...base,
      ok: false,
      action: "block_non_progress",
      decisive_evidence: [`live head ${input.live_head_sha}`],
      blockers: [`scheduled move is non-progress: ${input.candidate.move_class}`],
      next_route: "choose external embodiment, fresh live-head status readback, or one exact blocker",
    };
  }

  if (input.candidate.move_class === "fresh_status_readback") {
    const hasCurrentHeadChecks = input.current_head_check_run_ids.length > 0;
    if (!headMovedFromPrompt && !hasCurrentHeadChecks) {
      return {
        ...base,
        ok: false,
        action: "block_non_progress",
        decisive_evidence: [],
        blockers: ["fresh status readback requires a moved live head or new current-head checks"],
        next_route: "wait for new current-head checks or choose a new executable embodiment",
      };
    }

    return {
      ...base,
      ok: true,
      action: "admit_fresh_status_readback",
      decisive_evidence: [
        headMovedFromPrompt
          ? `live head moved from prompt-carried ${input.prompt_carried_head_sha} to ${input.live_head_sha}`
          : `new current-head checks: ${input.current_head_check_run_ids.join(", ")}`,
      ],
      blockers: [],
      next_route: "read the live-head status surface without replaying the resolved repaired-head blocker",
    };
  }

  if (input.candidate.move_class === "exact_external_blocker") {
    if (!input.candidate.exact_blocker?.trim()) {
      return {
        ...base,
        ok: false,
        action: "block_non_progress",
        decisive_evidence: [`live head ${input.live_head_sha}`],
        blockers: ["exact blocker move has no blocker text"],
        next_route: "emit one exact live-head blocker or choose executable embodiment",
      };
    }

    return {
      ...base,
      ok: true,
      action: "admit_exact_blocker",
      decisive_evidence: [input.candidate.exact_blocker],
      blockers: [input.candidate.exact_blocker],
      next_route: "release the exact blocker without adding duplicate PR metadata or status summaries",
    };
  }

  const failures = embodimentFailures(input.candidate);
  if (failures.length > 0) {
    return {
      ...base,
      ok: false,
      action: "block_non_progress",
      decisive_evidence: [`live head ${input.live_head_sha}`],
      blockers: failures,
      next_route: "raise the scheduled move to a complete executable embodiment increment",
    };
  }

  return {
    ...base,
    ok: true,
    action: "admit_external_embodiment",
    decisive_evidence: [
      `live head ${input.live_head_sha}`,
      ...input.candidate.changed_files.filter(executablePlatformPath),
      ...input.candidate.executable_artifacts,
      ...input.candidate.routing_artifacts,
      ...input.candidate.proof_artifacts,
    ],
    blockers: [],
    next_route: "commit the embodiment increment, then bind the next status cursor to the resulting new head",
  };
}
