export type FinalizationNextStepClass =
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

export type FinalizationNextStepAdmissionAction =
  | "admit_external_platform_embodiment"
  | "admit_fresh_status_readback"
  | "admit_exact_external_blocker"
  | "block_repeated_non_progress"
  | "block_stale_status_readback"
  | "block_incomplete_embodiment"
  | "block_incomplete_blocker";

export interface FinalizationNextStepAdmissionInput {
  active_branch: string;
  target_branch: string;
  prompt_head_sha: string;
  live_head_sha: string;
  previous_status_head_sha: string;
  new_check_ids: string[];
  candidate_class: FinalizationNextStepClass;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  blocker_text?: string;
}

export interface FinalizationNextStepAdmissionVerdict {
  ok: boolean;
  action: FinalizationNextStepAdmissionAction;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const REPEATED_NON_PROGRESS_CLASSES = new Set<FinalizationNextStepClass>([
  "metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "guessed_future_ci",
  "reclose_completed_blocker",
  "old_repaired_head_blocker",
]);

function executablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function base(input: FinalizationNextStepAdmissionInput): Pick<FinalizationNextStepAdmissionVerdict, "branch" | "head_sha"> {
  return { branch: input.target_branch, head_sha: input.live_head_sha };
}

function block(
  input: FinalizationNextStepAdmissionInput,
  action: Exclude<FinalizationNextStepAdmissionAction, "admit_external_platform_embodiment" | "admit_fresh_status_readback" | "admit_exact_external_blocker">,
  blockers: string[],
  nextRoute: string,
): FinalizationNextStepAdmissionVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: [],
    blockers,
    next_route: nextRoute,
  };
}

function embodimentBlockers(input: FinalizationNextStepAdmissionInput): string[] {
  const blockers: string[] = [];

  if (input.target_branch !== input.active_branch) {
    blockers.push(`target branch ${input.target_branch} does not match active branch ${input.active_branch}`);
  }
  if (!input.changed_files.some(executablePlatformPath)) {
    blockers.push("external embodiment has no executable platform file change");
  }
  if (input.executable_artifacts.length === 0) {
    blockers.push("external embodiment has no executable artifact evidence");
  }
  if (input.routing_artifacts.length === 0) {
    blockers.push("external embodiment has no future-routing artifact evidence");
  }
  if (input.proof_artifacts.length === 0) {
    blockers.push("external embodiment has no proof artifact evidence");
  }

  return blockers;
}

export function admitFinalizationNextStep(
  input: FinalizationNextStepAdmissionInput,
): FinalizationNextStepAdmissionVerdict {
  if (REPEATED_NON_PROGRESS_CLASSES.has(input.candidate_class)) {
    return block(
      input,
      "block_repeated_non_progress",
      [`candidate repeats forbidden non-progress class: ${input.candidate_class}`],
      "choose executable embodiment, moved-head/new-check status readback, or one exact external blocker",
    );
  }

  if (input.candidate_class === "fresh_status_readback") {
    const headMoved = input.live_head_sha !== input.previous_status_head_sha || input.live_head_sha !== input.prompt_head_sha;
    const checksChanged = input.new_check_ids.length > 0;

    if (!headMoved && !checksChanged) {
      return block(
        input,
        "block_stale_status_readback",
        ["fresh status readback requires a moved PR head or newly surfaced checks"],
        "do not reread status until the head or status surface changes",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_fresh_status_readback",
      decisive_evidence: [
        ...(headMoved ? [`live head ${input.live_head_sha} differs from prior status head ${input.previous_status_head_sha}`] : []),
        ...input.new_check_ids.map((id) => `new check surface: ${id}`),
      ],
      blockers: [],
      next_route: "perform one head-bound status readback for the changed PR surface",
    };
  }

  if (input.candidate_class === "exact_external_blocker") {
    const blocker = input.blocker_text?.trim();
    if (!blocker) {
      return block(
        input,
        "block_incomplete_blocker",
        ["exact external blocker candidate has no blocker text"],
        "name the exact external blocker or choose an executable embodiment",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_exact_external_blocker",
      decisive_evidence: [blocker],
      blockers: [],
      next_route: "publish only the exact blocker and stop",
    };
  }

  const blockers = embodimentBlockers(input);
  if (blockers.length > 0) {
    return block(
      input,
      "block_incomplete_embodiment",
      blockers,
      "raise the candidate to executable platform behavior with proof and routing evidence",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_external_platform_embodiment",
    decisive_evidence: [
      input.active_branch,
      input.live_head_sha,
      ...input.changed_files.filter(executablePlatformPath),
      ...input.executable_artifacts,
      ...input.routing_artifacts,
      ...input.proof_artifacts,
    ],
    blockers: [],
    next_route: "commit the admitted executable embodiment, then require status only for the resulting new head",
  };
}
