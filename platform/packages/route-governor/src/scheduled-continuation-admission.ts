export type ScheduledContinuationStatus = "passing" | "passing_with_warnings" | "pending" | "failing" | "missing";

export type ScheduledContinuationMoveClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "duplicate_status_summary"
  | "resolved_head_blocker_replay"
  | "metadata_reread";

export type ScheduledContinuationAdmissionAction =
  | "admit_external_embodiment"
  | "admit_fresh_status_readback"
  | "admit_exact_external_blocker"
  | "block_stale_prompt_head"
  | "block_repeated_or_resolved_move"
  | "block_unstable_status"
  | "block_incomplete_embodiment"
  | "block_missing_exact_blocker";

export interface ScheduledContinuationEmbodimentCandidate {
  candidate_id: string;
  base_head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
}

export interface ScheduledContinuationStatusSurface {
  head_sha: string;
  verdict: ScheduledContinuationStatus;
  check_run_ids: string[];
  blocking_failures: string[];
  pending_surfaces: string[];
  non_blocking_warnings: string[];
}

export interface ScheduledContinuationAdmissionInput {
  active_branch: string;
  prompt_head_sha: string;
  live_head_sha: string;
  last_readback_head_sha: string;
  resolved_repaired_head_sha: string;
  resolved_repaired_head_blockers: string[];
  move_class: ScheduledContinuationMoveClass;
  spent_move_classes: string[];
  spent_candidate_ids: string[];
  status_surface?: ScheduledContinuationStatusSurface;
  embodiment?: ScheduledContinuationEmbodimentCandidate;
  exact_blocker?: string;
}

export interface ScheduledContinuationAdmissionVerdict {
  ok: boolean;
  action: ScheduledContinuationAdmissionAction;
  branch: string;
  head_sha: string;
  quarantined_prompt_head: string | null;
  admitted_candidate_id: string | null;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

const REPEATED_CLASSES = new Set<ScheduledContinuationMoveClass>([
  "duplicate_status_summary",
  "resolved_head_blocker_replay",
  "metadata_reread",
]);

function executablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function base(input: ScheduledContinuationAdmissionInput): Pick<
  ScheduledContinuationAdmissionVerdict,
  "branch" | "head_sha" | "quarantined_prompt_head"
> {
  return {
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    quarantined_prompt_head: input.prompt_head_sha === input.live_head_sha ? null : input.prompt_head_sha,
  };
}

function block(
  input: ScheduledContinuationAdmissionInput,
  action: Exclude<
    ScheduledContinuationAdmissionAction,
    "admit_external_embodiment" | "admit_fresh_status_readback" | "admit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  warnings: string[] = [],
): ScheduledContinuationAdmissionVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    admitted_candidate_id: null,
    decisive_evidence: [],
    blockers,
    warnings,
    next_route: nextRoute,
  };
}

function embodimentBlockers(input: ScheduledContinuationAdmissionInput): string[] {
  const candidate = input.embodiment;
  if (!candidate) return ["external embodiment admission has no embodiment candidate"];

  const blockers: string[] = [];
  if (!candidate.candidate_id.trim()) blockers.push("embodiment candidate has no id");
  if (input.spent_candidate_ids.includes(candidate.candidate_id)) {
    blockers.push(`embodiment candidate already spent: ${candidate.candidate_id}`);
  }
  if (candidate.base_head_sha !== input.live_head_sha) {
    blockers.push(`embodiment candidate base ${candidate.base_head_sha} is not live head ${input.live_head_sha}`);
  }
  if (!candidate.changed_files.some(executablePlatformPath)) {
    blockers.push("embodiment candidate changes no executable platform file");
  }
  if (candidate.executable_artifacts.length === 0) blockers.push("embodiment candidate has no executable artifacts");
  if (candidate.routing_artifacts.length === 0) blockers.push("embodiment candidate has no routing artifacts");
  if (candidate.proof_artifacts.length === 0) blockers.push("embodiment candidate has no proof artifacts");

  return blockers;
}

function statusWarnings(surface?: ScheduledContinuationStatusSurface): string[] {
  return surface?.non_blocking_warnings ?? [];
}

export function admitScheduledContinuation(
  input: ScheduledContinuationAdmissionInput,
): ScheduledContinuationAdmissionVerdict {
  const surface = input.status_surface;

  if (input.prompt_head_sha !== input.live_head_sha && input.prompt_head_sha !== input.resolved_repaired_head_sha) {
    return block(
      input,
      "block_stale_prompt_head",
      [`prompt head ${input.prompt_head_sha} is neither live nor the resolved repaired head`],
      "rebase scheduled finalization to the live PR head before choosing a release class",
      statusWarnings(surface),
    );
  }

  if (REPEATED_CLASSES.has(input.move_class) || input.spent_move_classes.includes(input.move_class)) {
    return block(
      input,
      "block_repeated_or_resolved_move",
      [`scheduled continuation move class is unavailable: ${input.move_class}`],
      "choose external embodiment, moved-head status readback, or one exact live blocker",
      statusWarnings(surface),
    );
  }

  if (surface && surface.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_unstable_status",
      [`status surface belongs to ${surface.head_sha}, not live head ${input.live_head_sha}`],
      "discard stale status and bind the next readback or embodiment to the live head",
      statusWarnings(surface),
    );
  }

  if (surface?.verdict === "failing") {
    return block(
      input,
      "block_unstable_status",
      surface.blocking_failures.length > 0 ? surface.blocking_failures : ["live-head status is failing"],
      "repair the concrete live-head failure before scheduled embodiment admission",
      statusWarnings(surface),
    );
  }

  if (surface?.verdict === "pending") {
    return block(
      input,
      "block_unstable_status",
      surface.pending_surfaces.length > 0 ? surface.pending_surfaces : ["live-head checks are pending"],
      "wait for live-head checks or emit the exact external blocker",
      statusWarnings(surface),
    );
  }

  if (input.move_class === "fresh_status_readback") {
    const headMoved = input.live_head_sha !== input.last_readback_head_sha;
    const hasCurrentChecks = (surface?.check_run_ids.length ?? 0) > 0;
    if (!headMoved && !hasCurrentChecks) {
      return block(
        input,
        "block_repeated_or_resolved_move",
        ["fresh status readback requires a moved head or new current-head checks"],
        "choose a non-repeated executable embodiment or name one exact blocker",
        statusWarnings(surface),
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_fresh_status_readback",
      admitted_candidate_id: null,
      decisive_evidence: [
        ...(headMoved ? [`head moved from ${input.last_readback_head_sha} to ${input.live_head_sha}`] : []),
        ...(surface?.check_run_ids.map((id) => `current-head check ${id}`) ?? []),
      ],
      blockers: [],
      warnings: statusWarnings(surface),
      next_route: "publish only head-bound status, then require a non-repeated executable embodiment",
    };
  }

  if (input.move_class === "exact_external_blocker") {
    const blocker = input.exact_blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_missing_exact_blocker",
        ["exact external blocker move has no blocker text"],
        "name the exact live external blocker or choose embodiment",
        statusWarnings(surface),
      );
    }

    if (input.resolved_repaired_head_blockers.includes(blocker)) {
      return block(
        input,
        "block_repeated_or_resolved_move",
        [`resolved repaired-head blocker cannot be replayed: ${blocker}`],
        "preserve the resolved blocker as history and route from the live head",
        statusWarnings(surface),
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_exact_external_blocker",
      admitted_candidate_id: null,
      decisive_evidence: [blocker, `live head ${input.live_head_sha}`],
      blockers: [blocker],
      warnings: statusWarnings(surface),
      next_route: "remove the named live external blocker before another scheduled release",
    };
  }

  const blockers = embodimentBlockers(input);
  if (blockers.length > 0) {
    return block(input, "block_incomplete_embodiment", blockers, "complete the executable embodiment candidate", statusWarnings(surface));
  }

  const candidate = input.embodiment;
  if (!candidate) {
    return block(
      input,
      "block_incomplete_embodiment",
      ["external embodiment admission has no embodiment candidate"],
      "complete the executable embodiment candidate",
      statusWarnings(surface),
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_external_embodiment",
    admitted_candidate_id: candidate.candidate_id,
    decisive_evidence: [
      candidate.candidate_id,
      ...candidate.changed_files.filter(executablePlatformPath),
      ...candidate.executable_artifacts,
      ...candidate.routing_artifacts,
      ...candidate.proof_artifacts,
    ],
    blockers: [],
    warnings: statusWarnings(surface),
    next_route: "commit this embodiment, then read only the moved live head status",
  };
}
