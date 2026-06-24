export type ScheduledRunInvocationKind = "scheduled" | "manual" | "user_message";

export type ScheduledRunMoveClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "duplicate_ci_summary"
  | "metadata_reread"
  | "duplicate_comment"
  | "internal_memory_guard";

export type ScheduledRunAdmissionAction =
  | "admit_scheduled_embodiment"
  | "admit_moved_head_status_readback"
  | "emit_scheduled_exact_blocker"
  | "block_stale_scheduled_base"
  | "block_replayed_scheduled_artifact"
  | "block_scheduled_non_progress"
  | "block_incomplete_scheduled_candidate";

export interface ScheduledRunCandidate {
  candidate_id: string;
  move_class: ScheduledRunMoveClass;
  artifact_class: string;
  base_head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  status_surface_ids: string[];
  blocker?: string;
}

export interface ScheduledRunAdmissionInput {
  invocation_kind: ScheduledRunInvocationKind;
  active_branch: string;
  live_head_sha: string;
  instruction_head_sha: string;
  last_repaired_head_sha: string;
  repaired_head_status_resolved: boolean;
  candidate: ScheduledRunCandidate;
  spent_artifact_classes: string[];
  prohibited_move_classes: ScheduledRunMoveClass[];
  prohibited_blockers?: string[];
}

export interface ScheduledRunAdmissionVerdict {
  ok: boolean;
  action: ScheduledRunAdmissionAction;
  branch: string;
  head_sha: string;
  instruction_head_is_live: boolean;
  historical_repaired_head_sha: string | null;
  admitted_candidate_id: string | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_MOVE_CLASSES = new Set<ScheduledRunMoveClass>([
  "duplicate_ci_summary",
  "metadata_reread",
  "duplicate_comment",
  "internal_memory_guard",
]);

function executablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function base(input: ScheduledRunAdmissionInput): Pick<
  ScheduledRunAdmissionVerdict,
  "branch" | "head_sha" | "instruction_head_is_live" | "historical_repaired_head_sha"
> {
  return {
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    instruction_head_is_live: input.instruction_head_sha === input.live_head_sha,
    historical_repaired_head_sha:
      input.repaired_head_status_resolved && input.instruction_head_sha === input.last_repaired_head_sha
        ? input.last_repaired_head_sha
        : null,
  };
}

function block(
  input: ScheduledRunAdmissionInput,
  action: Exclude<
    ScheduledRunAdmissionAction,
    "admit_scheduled_embodiment" | "admit_moved_head_status_readback" | "emit_scheduled_exact_blocker"
  >,
  blockers: string[],
  nextRoute: string,
): ScheduledRunAdmissionVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    admitted_candidate_id: null,
    decisive_evidence: [],
    blockers,
    next_route: nextRoute,
  };
}

function embodimentBlockers(candidate: ScheduledRunCandidate): string[] {
  const blockers: string[] = [];
  if (!candidate.candidate_id.trim()) blockers.push("scheduled candidate has no id");
  if (!candidate.artifact_class.trim()) blockers.push("scheduled candidate has no artifact class");
  if (!candidate.changed_files.some(executablePlatformPath)) {
    blockers.push("scheduled embodiment changes no executable platform file");
  }
  if (candidate.executable_artifacts.length === 0) blockers.push("scheduled embodiment has no executable artifact");
  if (candidate.routing_artifacts.length === 0) blockers.push("scheduled embodiment has no future-routing artifact");
  if (candidate.proof_artifacts.length === 0) blockers.push("scheduled embodiment has no proof artifact");
  return blockers;
}

export function admitScheduledRunProgress(input: ScheduledRunAdmissionInput): ScheduledRunAdmissionVerdict {
  const candidate = input.candidate;

  if (candidate.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_scheduled_base",
      [`scheduled candidate base ${candidate.base_head_sha} is not live PR head ${input.live_head_sha}`],
      "rebase the scheduled candidate to the live PR head before moving the branch",
    );
  }

  if (input.prohibited_move_classes.includes(candidate.move_class) || NON_PROGRESS_MOVE_CLASSES.has(candidate.move_class)) {
    return block(
      input,
      "block_scheduled_non_progress",
      [`scheduled run cannot count move class as progress: ${candidate.move_class}`],
      "choose external embodiment, moved-head status readback, or an exact blocker",
    );
  }

  if (candidate.move_class === "fresh_status_readback") {
    const headMovedSinceInstruction = input.instruction_head_sha !== input.live_head_sha;
    if (!headMovedSinceInstruction && candidate.status_surface_ids.length === 0) {
      return block(
        input,
        "block_incomplete_scheduled_candidate",
        ["scheduled status readback needs a moved instruction head or a current status surface id"],
        "attach a live-head status surface before releasing a scheduled readback",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_moved_head_status_readback",
      admitted_candidate_id: candidate.candidate_id,
      decisive_evidence: [
        ...(headMovedSinceInstruction ? [`instruction head moved to live head ${input.live_head_sha}`] : []),
        ...candidate.status_surface_ids.map((id) => `status surface ${id}`),
      ],
      blockers: [],
      next_route: "publish only the live-head readback, then require a non-repeated embodiment",
    };
  }

  if (candidate.move_class === "exact_external_blocker") {
    const blockerText = candidate.blocker?.trim();
    if (!blockerText) {
      return block(
        input,
        "block_incomplete_scheduled_candidate",
        ["scheduled exact blocker has no blocker text"],
        "name the exact external blocker before releasing from a scheduled run",
      );
    }

    if (input.prohibited_blockers?.includes(blockerText)) {
      return block(
        input,
        "block_scheduled_non_progress",
        [`scheduled run cannot emit prohibited blocker: ${blockerText}`],
        "preserve the resolved boundary and choose external embodiment, moved-head status readback, or a different exact blocker",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_scheduled_exact_blocker",
      admitted_candidate_id: candidate.candidate_id,
      decisive_evidence: [blockerText],
      blockers: [blockerText],
      next_route: "remove the exact blocker before the next scheduled embodiment attempt",
    };
  }

  if (input.spent_artifact_classes.includes(candidate.artifact_class)) {
    return block(
      input,
      "block_replayed_scheduled_artifact",
      [`scheduled artifact class already spent: ${candidate.artifact_class}`],
      "select an unspent scheduled embodiment artifact class",
    );
  }

  const blockers = embodimentBlockers(candidate);
  if (blockers.length > 0) {
    return block(input, "block_incomplete_scheduled_candidate", blockers, "complete the scheduled embodiment candidate");
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_scheduled_embodiment",
    admitted_candidate_id: candidate.candidate_id,
    decisive_evidence: [
      candidate.candidate_id,
      candidate.artifact_class,
      `scheduled invocation: ${input.invocation_kind}`,
      ...candidate.changed_files.filter(executablePlatformPath),
      ...candidate.executable_artifacts,
      ...candidate.routing_artifacts,
      ...candidate.proof_artifacts,
    ],
    blockers: [],
    next_route: "commit the scheduled embodiment, then bind status readback to the moved head",
  };
}
