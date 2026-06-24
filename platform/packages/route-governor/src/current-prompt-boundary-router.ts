export type PromptBoundaryMoveClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "repaired_head_blocker"
  | "duplicate_ci_summary"
  | "metadata_reread"
  | "local_memory_guard"
  | "guess_future_ci";

export type PromptBoundaryAction =
  | "admit_external_embodiment"
  | "admit_fresh_status_readback"
  | "admit_exact_blocker"
  | "block_stale_repaired_head"
  | "block_non_progress_move"
  | "block_incomplete_embodiment";

export interface PromptBoundaryEmbodimentEvidence {
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
}

export interface PromptBoundaryInput {
  active_branch: string;
  target_branch: string;
  prompt_head_sha: string;
  live_head_sha: string;
  current_check_run_ids: string[];
  requested_move_class: PromptBoundaryMoveClass;
  embodiment?: PromptBoundaryEmbodimentEvidence;
  exact_blocker?: string;
}

export interface PromptBoundaryVerdict {
  ok: boolean;
  action: PromptBoundaryAction;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_MOVE_CLASSES = new Set<PromptBoundaryMoveClass>([
  "duplicate_ci_summary",
  "metadata_reread",
  "local_memory_guard",
  "guess_future_ci",
]);

function executablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function base(input: PromptBoundaryInput): Pick<PromptBoundaryVerdict, "branch" | "head_sha"> {
  return { branch: input.active_branch, head_sha: input.live_head_sha };
}

function block(
  input: PromptBoundaryInput,
  action: Exclude<PromptBoundaryAction, "admit_external_embodiment" | "admit_fresh_status_readback" | "admit_exact_blocker">,
  blockers: string[],
  nextRoute: string,
): PromptBoundaryVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: [],
    blockers,
    next_route: nextRoute,
  };
}

function embodimentBlockers(input: PromptBoundaryInput): string[] {
  const embodiment = input.embodiment;
  if (!embodiment) return ["external embodiment move has no embodiment evidence"];

  const blockers: string[] = [];
  if (!embodiment.changed_files.some(executablePlatformPath)) {
    blockers.push("external embodiment does not change executable platform files");
  }
  if (embodiment.executable_artifacts.length === 0) {
    blockers.push("external embodiment has no executable artifact evidence");
  }
  if (embodiment.routing_artifacts.length === 0) {
    blockers.push("external embodiment has no future-routing artifact evidence");
  }
  if (embodiment.proof_artifacts.length === 0) {
    blockers.push("external embodiment has no proof artifact evidence");
  }

  return blockers;
}

export function routeCurrentPromptBoundary(input: PromptBoundaryInput): PromptBoundaryVerdict {
  const headMoved = input.prompt_head_sha !== input.live_head_sha;
  const hasFreshCheckSurface = input.current_check_run_ids.length > 0;

  if (input.active_branch !== input.target_branch) {
    return block(
      input,
      "block_non_progress_move",
      [`active branch ${input.active_branch} does not match target branch ${input.target_branch}`],
      "rebind the move to the active PR branch before finalization progress is admitted",
    );
  }

  if (input.requested_move_class === "repaired_head_blocker") {
    return block(
      input,
      "block_stale_repaired_head",
      [`prompt repaired-head blocker is stale for ${input.prompt_head_sha}`],
      headMoved
        ? "discard the repaired-head blocker and route from the live PR head"
        : "discard the repaired-head blocker; repaired-head status is already resolved",
    );
  }

  if (NON_PROGRESS_MOVE_CLASSES.has(input.requested_move_class)) {
    return block(
      input,
      "block_non_progress_move",
      [`move class is non-progress under the current prompt boundary: ${input.requested_move_class}`],
      "choose external embodiment, fresh moved-head status readback, or one exact external blocker",
    );
  }

  if (input.requested_move_class === "fresh_status_readback") {
    if (!headMoved && !hasFreshCheckSurface) {
      return block(
        input,
        "block_non_progress_move",
        ["fresh status readback requires a moved PR head or new current-head checks"],
        "choose an executable embodiment increment or emit one exact external blocker",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_fresh_status_readback",
      decisive_evidence: [
        ...(headMoved ? [`PR head moved from ${input.prompt_head_sha} to ${input.live_head_sha}`] : []),
        ...input.current_check_run_ids.map((id) => `current-head check run ${id}`),
      ],
      blockers: [],
      next_route: "read only the live-head status surface before making any pass/fail claim",
    };
  }

  if (input.requested_move_class === "exact_external_blocker") {
    if (!input.exact_blocker?.trim()) {
      return block(
        input,
        "block_non_progress_move",
        ["exact external blocker move has no blocker"],
        "name the exact external blocker or choose an executable embodiment increment",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_exact_blocker",
      decisive_evidence: [input.exact_blocker],
      blockers: [input.exact_blocker],
      next_route: "remove the named blocker before attempting another finalization progress class",
    };
  }

  const blockers = embodimentBlockers(input);
  if (blockers.length > 0) {
    return block(
      input,
      "block_incomplete_embodiment",
      blockers,
      "supply executable platform, future-routing, and proof evidence for the embodiment increment",
    );
  }

  const embodiment = input.embodiment;
  if (!embodiment) {
    return block(
      input,
      "block_incomplete_embodiment",
      ["external embodiment move has no embodiment evidence"],
      "supply executable platform, future-routing, and proof evidence for the embodiment increment",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_external_embodiment",
    decisive_evidence: [
      ...embodiment.changed_files.filter(executablePlatformPath),
      ...embodiment.executable_artifacts,
      ...embodiment.routing_artifacts,
      ...embodiment.proof_artifacts,
      ...(headMoved ? [`prompt head preserved only as historical boundary: ${input.prompt_head_sha}`] : []),
    ],
    blockers: [],
    next_route: "commit the executable embodiment; after the branch moves, make no status claim until live-head checks are read",
  };
}
