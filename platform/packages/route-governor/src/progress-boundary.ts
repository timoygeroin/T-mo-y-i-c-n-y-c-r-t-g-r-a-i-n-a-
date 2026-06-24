export type ProgressBoundaryMoveClass =
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
  | "duplicate_status_readback";

export type ProgressBoundaryAction =
  | "commit_external_embodiment"
  | "read_current_head_status"
  | "emit_exact_external_blocker"
  | "block_non_progress"
  | "block_incomplete_progress";

export interface ProgressBoundaryCheckRun {
  id: string;
  head_sha: string;
}

export interface ProgressBoundaryInput {
  branch: string;
  active_branch: string;
  current_head_sha: string;
  last_readback_head_sha: string;
  move_class: ProgressBoundaryMoveClass;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  new_check_runs?: ProgressBoundaryCheckRun[];
  exact_blocker?: string;
}

export interface ProgressBoundaryVerdict {
  ok: boolean;
  action: ProgressBoundaryAction;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_CLASSES = new Set<ProgressBoundaryMoveClass>([
  "metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "guessed_future_ci",
  "reclose_completed_blocker",
  "duplicate_status_readback",
]);

function isExecutablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function currentHeadChecks(input: ProgressBoundaryInput): ProgressBoundaryCheckRun[] {
  return (input.new_check_runs ?? []).filter((run) => run.head_sha === input.current_head_sha);
}

function base(input: ProgressBoundaryInput): Pick<ProgressBoundaryVerdict, "branch" | "head_sha"> {
  return { branch: input.branch, head_sha: input.current_head_sha };
}

export function classifyProgressBoundary(input: ProgressBoundaryInput): ProgressBoundaryVerdict {
  if (input.branch !== input.active_branch) {
    return {
      ...base(input),
      ok: false,
      action: "block_incomplete_progress",
      decisive_evidence: [],
      blockers: [`progress boundary branch ${input.branch} does not match active branch ${input.active_branch}`],
      next_route: "rebind progress evaluation to the active PR branch before release",
    };
  }

  if (NON_PROGRESS_CLASSES.has(input.move_class)) {
    return {
      ...base(input),
      ok: false,
      action: "block_non_progress",
      decisive_evidence: [input.move_class],
      blockers: [`move class is explicitly non-progress: ${input.move_class}`],
      next_route: "select external embodiment, moved-head readback, new-check readback, or an exact external blocker",
    };
  }

  if (input.move_class === "external_platform_embodiment") {
    const blockers: string[] = [];
    if (!input.changed_files.some(isExecutablePlatformPath)) blockers.push("embodiment does not change executable platform files");
    if (input.executable_artifacts.length === 0) blockers.push("embodiment has no executable artifact");
    if (input.routing_artifacts.length === 0) blockers.push("embodiment has no future-routing artifact");

    if (blockers.length > 0) {
      return {
        ...base(input),
        ok: false,
        action: "block_incomplete_progress",
        decisive_evidence: input.changed_files,
        blockers,
        next_route: "raise the embodiment to executable behavior plus future-routing evidence before committing",
      };
    }

    return {
      ...base(input),
      ok: true,
      action: "commit_external_embodiment",
      decisive_evidence: [...input.changed_files, ...input.executable_artifacts, ...input.routing_artifacts],
      blockers: [],
      next_route: "after the branch moves, read only status surfaces bound to the new PR head",
    };
  }

  if (input.move_class === "fresh_status_readback") {
    const headMoved = input.current_head_sha !== input.last_readback_head_sha;
    const checks = currentHeadChecks(input);

    if (!headMoved && checks.length === 0) {
      return {
        ...base(input),
        ok: false,
        action: "block_incomplete_progress",
        decisive_evidence: [],
        blockers: ["fresh status readback requires a moved PR head or new check runs bound to the current head"],
        next_route: "wait for branch movement or attach current-head check-run evidence before reading status again",
      };
    }

    return {
      ...base(input),
      ok: true,
      action: "read_current_head_status",
      decisive_evidence: [
        ...(headMoved ? [`head moved from ${input.last_readback_head_sha} to ${input.current_head_sha}`] : []),
        ...checks.map((run) => `new current-head check run ${run.id}`),
      ],
      blockers: [],
      next_route: "publish no status claim until the readback is bound to those current-head surfaces",
    };
  }

  const blocker = input.exact_blocker?.trim();
  if (!blocker) {
    return {
      ...base(input),
      ok: false,
      action: "block_incomplete_progress",
      decisive_evidence: [],
      blockers: ["exact external blocker move has no blocker text"],
      next_route: "name the external blocker exactly or choose an executable embodiment",
    };
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
