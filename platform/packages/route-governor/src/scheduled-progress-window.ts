export type ScheduledProgressStatusAuthority =
  | "current_head_passing"
  | "current_head_passing_with_warnings"
  | "current_head_failing"
  | "current_head_pending"
  | "head_moved_since_status"
  | "missing_status_surface";

export type ScheduledProgressMoveClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "duplicate_ci_summary"
  | "metadata_reread"
  | "duplicate_comment"
  | "duplicate_label"
  | "local_memory_guard"
  | "guessed_future_ci";

export type ScheduledProgressAction =
  | "admit_scheduled_embodiment"
  | "admit_scheduled_readback"
  | "emit_scheduled_blocker"
  | "block_spent_invocation"
  | "block_progress_slot_exhausted"
  | "block_branch_or_head_mismatch"
  | "block_status_authority"
  | "block_non_progress_candidate"
  | "block_incomplete_candidate";

export interface ScheduledProgressCandidate {
  move_class: ScheduledProgressMoveClass;
  branch: string;
  base_head_sha: string;
  artifact_class: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  new_check_run_ids: string[];
  blocker?: string;
}

export interface ScheduledProgressWindowInput {
  invocation_id: string;
  spent_invocation_ids: string[];
  active_branch: string;
  live_head_sha: string;
  previous_status_head_sha: string;
  status_authority: ScheduledProgressStatusAuthority;
  progress_slots_spent: number;
  max_progress_slots: number;
  candidate: ScheduledProgressCandidate;
}

export interface ScheduledProgressWindowVerdict {
  ok: boolean;
  action: ScheduledProgressAction;
  branch: string;
  head_sha: string;
  invocation_id: string;
  consumed_progress_slots: number;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_MOVES = new Set<ScheduledProgressMoveClass>([
  "duplicate_ci_summary",
  "metadata_reread",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "guessed_future_ci",
]);

function executablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function base(input: ScheduledProgressWindowInput): Pick<
  ScheduledProgressWindowVerdict,
  "branch" | "head_sha" | "invocation_id"
> {
  return {
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    invocation_id: input.invocation_id,
  };
}

function block(
  input: ScheduledProgressWindowInput,
  action: Exclude<
    ScheduledProgressAction,
    "admit_scheduled_embodiment" | "admit_scheduled_readback" | "emit_scheduled_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ScheduledProgressWindowVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    consumed_progress_slots: input.progress_slots_spent,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function embodimentBlockers(candidate: ScheduledProgressCandidate): string[] {
  const blockers: string[] = [];

  if (!candidate.artifact_class.trim()) blockers.push("scheduled embodiment has no artifact class");
  if (!candidate.changed_files.some(executablePlatformPath)) {
    blockers.push("scheduled embodiment changes no executable platform file");
  }
  if (candidate.executable_artifacts.length === 0) blockers.push("scheduled embodiment has no executable artifact evidence");
  if (candidate.routing_artifacts.length === 0) blockers.push("scheduled embodiment has no future-routing artifact evidence");
  if (candidate.proof_artifacts.length === 0) blockers.push("scheduled embodiment has no proof artifact evidence");

  return blockers;
}

function statusAllowsEmbodiment(input: ScheduledProgressWindowInput): boolean {
  return (
    input.status_authority === "current_head_passing" ||
    input.status_authority === "current_head_passing_with_warnings" ||
    input.status_authority === "head_moved_since_status"
  );
}

function headMoved(input: ScheduledProgressWindowInput): boolean {
  return input.live_head_sha !== input.previous_status_head_sha;
}

export function compileScheduledProgressWindow(
  input: ScheduledProgressWindowInput,
): ScheduledProgressWindowVerdict {
  const candidate = input.candidate;

  if (!input.invocation_id.trim()) {
    return block(input, "block_spent_invocation", ["scheduled progress invocation has no id"], "name this scheduled invocation before admitting progress");
  }

  if (input.spent_invocation_ids.includes(input.invocation_id)) {
    return block(
      input,
      "block_spent_invocation",
      [`scheduled progress invocation already spent: ${input.invocation_id}`],
      "wait for a new invocation before counting another progress event",
    );
  }

  if (input.progress_slots_spent >= input.max_progress_slots) {
    return block(
      input,
      "block_progress_slot_exhausted",
      [`scheduled progress slot already consumed: ${input.progress_slots_spent}/${input.max_progress_slots}`],
      "release the first valid progress event only; do not stack readback, metadata, and comments as extra progress",
    );
  }

  if (candidate.branch !== input.active_branch || candidate.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_branch_or_head_mismatch",
      [
        ...(candidate.branch !== input.active_branch
          ? [`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`]
          : []),
        ...(candidate.base_head_sha !== input.live_head_sha
          ? [`candidate base ${candidate.base_head_sha} does not match live head ${input.live_head_sha}`]
          : []),
      ],
      "rebase the scheduled candidate to the live PR branch head before release",
    );
  }

  if (NON_PROGRESS_MOVES.has(candidate.move_class)) {
    return block(
      input,
      "block_non_progress_candidate",
      [`scheduled candidate is not terminal progress: ${candidate.move_class}`],
      "choose external embodiment, legitimately fresh status readback, or one exact blocker",
      [candidate.move_class],
    );
  }

  if (candidate.move_class === "fresh_status_readback") {
    if (!headMoved(input) && candidate.new_check_run_ids.length === 0) {
      return block(
        input,
        "block_status_authority",
        ["scheduled fresh readback requires a moved PR head or new live-head check runs"],
        "do not replay the same status surface inside this scheduled invocation",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_scheduled_readback",
      consumed_progress_slots: input.progress_slots_spent + 1,
      decisive_evidence: [
        ...(headMoved(input) ? [`head moved from ${input.previous_status_head_sha} to ${input.live_head_sha}`] : []),
        ...candidate.new_check_run_ids.map((id) => `new live-head check ${id}`),
      ],
      blockers: [],
      next_route: "publish only the live-head status readback; this invocation cannot count a second progress event",
    };
  }

  if (candidate.move_class === "exact_external_blocker") {
    const blocker = candidate.blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_incomplete_candidate",
        ["scheduled exact blocker candidate has no blocker text"],
        "name the exact external blocker or choose executable embodiment",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_scheduled_blocker",
      consumed_progress_slots: input.progress_slots_spent + 1,
      decisive_evidence: [blocker, `live head ${input.live_head_sha}`],
      blockers: [blocker],
      next_route: "remove the named blocker before spending another scheduled progress slot",
    };
  }

  if (!statusAllowsEmbodiment(input)) {
    return block(
      input,
      "block_status_authority",
      [`scheduled embodiment lacks current-head status authority: ${input.status_authority}`],
      "obtain live-head status authority or emit the exact blocker before writing embodiment code",
    );
  }

  const blockers = embodimentBlockers(candidate);
  if (blockers.length > 0) {
    return block(input, "block_incomplete_candidate", blockers, "complete executable embodiment evidence before spending the scheduled progress slot");
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_scheduled_embodiment",
    consumed_progress_slots: input.progress_slots_spent + 1,
    decisive_evidence: [
      input.invocation_id,
      `status authority ${input.status_authority}`,
      candidate.artifact_class,
      ...candidate.changed_files.filter(executablePlatformPath),
      ...candidate.executable_artifacts,
      ...candidate.routing_artifacts,
      ...candidate.proof_artifacts,
    ],
    blockers: [],
    next_route: "commit this embodiment as the invocation's single progress event, then bind status to the moved head",
  };
}
