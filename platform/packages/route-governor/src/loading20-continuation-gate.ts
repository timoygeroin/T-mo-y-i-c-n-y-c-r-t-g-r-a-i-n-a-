export type Loading20StatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "no_status_surface";

export type Loading20MoveClass =
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

export type Loading20ContinuationAction =
  | "read_moved_head_status"
  | "commit_external_embodiment"
  | "emit_exact_external_blocker"
  | "block_release";

export interface Loading20CheckEvidence {
  id: string;
  head_sha: string;
}

export interface Loading20StatusSurface {
  head_sha: string;
  verdict: Loading20StatusVerdict;
  decisive_successes: string[];
  blocking_failures: string[];
  pending_surfaces: string[];
  non_blocking_warnings: string[];
}

export interface Loading20ContinuationInput {
  branch: string;
  active_branch: string;
  prompt_head_sha: string;
  live_head_sha: string;
  resolved_repaired_head_sha: string;
  repaired_head_status_resolved: boolean;
  move_class: Loading20MoveClass;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  new_current_head_checks: Loading20CheckEvidence[];
  prohibited_blockers: string[];
  status_surface?: Loading20StatusSurface;
  exact_blocker?: string;
}

export interface Loading20ContinuationVerdict {
  ok: boolean;
  action: Loading20ContinuationAction;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

const NON_PROGRESS_CLASSES = new Set<Loading20MoveClass>([
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

function base(input: Loading20ContinuationInput): Pick<Loading20ContinuationVerdict, "branch" | "head_sha" | "warnings"> {
  return {
    branch: input.branch,
    head_sha: input.live_head_sha,
    warnings: input.status_surface?.non_blocking_warnings ?? [],
  };
}

function block(input: Loading20ContinuationInput, blockers: string[], nextRoute: string): Loading20ContinuationVerdict {
  return {
    ...base(input),
    ok: false,
    action: "block_release",
    decisive_evidence: [],
    blockers,
    next_route: nextRoute,
  };
}

function isExecutablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function statusAllowsEmbodiment(surface: Loading20StatusSurface): boolean {
  return surface.verdict === "passing" || surface.verdict === "passing_with_warnings";
}

function currentHeadCheckIds(input: Loading20ContinuationInput): string[] {
  return input.new_current_head_checks.filter((check) => check.head_sha === input.live_head_sha).map((check) => check.id);
}

function attemptedProhibitedBlocker(input: Loading20ContinuationInput): string | null {
  const blocker = input.exact_blocker?.trim();
  if (!blocker) return null;
  return input.prohibited_blockers.find((prohibited) => prohibited === blocker) ?? null;
}

function embodimentIsExecutable(input: Loading20ContinuationInput): boolean {
  return (
    input.changed_files.some(isExecutablePlatformPath) &&
    input.executable_artifacts.length > 0 &&
    input.routing_artifacts.length > 0
  );
}

export function routeLoading20Continuation(input: Loading20ContinuationInput): Loading20ContinuationVerdict {
  if (input.branch !== input.active_branch) {
    return block(
      input,
      [`Loading 20 branch ${input.branch} does not match active branch ${input.active_branch}`],
      "rebind the continuation gate to the active PR branch",
    );
  }

  const prohibited = attemptedProhibitedBlocker(input);
  if (prohibited) {
    return block(
      input,
      [`prohibited blocker cannot be emitted after repaired-head resolution: ${prohibited}`],
      "discard the repaired-head blocker and route through the live PR head",
    );
  }

  if (NON_PROGRESS_CLASSES.has(input.move_class)) {
    return block(
      input,
      [`Loading 20 move class is explicitly non-progress: ${input.move_class}`],
      "choose moved-head status readback, executable embodiment, or one exact live-head blocker",
    );
  }

  const liveHeadMoved = input.prompt_head_sha !== input.live_head_sha;
  const repairedHeadResolved =
    input.repaired_head_status_resolved && input.resolved_repaired_head_sha === input.prompt_head_sha;
  const surface = input.status_surface;

  if (surface && surface.head_sha !== input.live_head_sha) {
    return block(
      input,
      [`status surface belongs to ${surface.head_sha}, not live PR head ${input.live_head_sha}`],
      "read only status surfaces bound to the live PR head",
    );
  }

  if (input.move_class === "fresh_status_readback") {
    const currentHeadChecks = currentHeadCheckIds(input);
    if (!liveHeadMoved && currentHeadChecks.length === 0) {
      return block(
        input,
        ["fresh status readback requires a moved PR head or new current-head checks"],
        "select executable embodiment or name one exact live-head blocker",
      );
    }

    if (!surface) {
      return block(
        input,
        ["fresh status readback has no live-head status surface attached"],
        "attach status/check evidence bound to the live PR head before publishing readback",
      );
    }

    if (surface.verdict === "pending") {
      return {
        ...base(input),
        ok: false,
        action: "read_moved_head_status",
        decisive_evidence: [...surface.decisive_successes, ...currentHeadChecks.map((id) => `current-head check ${id}`)],
        blockers: surface.pending_surfaces.length > 0 ? surface.pending_surfaces : ["live-head checks are pending"],
        next_route: "wait for live-head checks to finish before claiming repaired continuation",
      };
    }

    if (!statusAllowsEmbodiment(surface)) {
      return {
        ...base(input),
        ok: false,
        action: "block_release",
        decisive_evidence: surface.decisive_successes,
        blockers: surface.blocking_failures.length > 0 ? surface.blocking_failures : [`live-head status is ${surface.verdict}`],
        next_route: "repair the live-head status failure before embodiment",
      };
    }

    return {
      ...base(input),
      ok: true,
      action: "read_moved_head_status",
      decisive_evidence: [
        ...(liveHeadMoved ? [`PR head moved from ${input.prompt_head_sha} to ${input.live_head_sha}`] : []),
        ...(repairedHeadResolved ? [`repaired head ${input.prompt_head_sha} already resolved`] : []),
        ...surface.decisive_successes,
        ...currentHeadChecks.map((id) => `current-head check ${id}`),
      ],
      blockers: [],
      next_route: "after readback, choose a non-repeated executable embodiment class",
    };
  }

  if (input.move_class === "exact_external_blocker") {
    const blocker = input.exact_blocker?.trim();
    if (!blocker) {
      return block(input, ["exact external blocker move has no blocker text"], "name one exact live-head blocker or choose executable embodiment");
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_exact_external_blocker",
      decisive_evidence: [blocker],
      blockers: [blocker],
      next_route: "remove the named live-head blocker before attempting another progress class",
    };
  }

  if (surface && !statusAllowsEmbodiment(surface)) {
    return block(
      input,
      [...surface.blocking_failures, ...surface.pending_surfaces, `live-head status is ${surface.verdict}`],
      "repair or wait on the live-head status surface before embodiment",
    );
  }

  if (!embodimentIsExecutable(input)) {
    return block(
      input,
      ["Loading 20 embodiment lacks executable platform change or future-routing artifact"],
      "commit executable platform behavior plus routing evidence, or name the exact blocker",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "commit_external_embodiment",
    decisive_evidence: [
      ...(liveHeadMoved ? [`live PR head supersedes prompt-carried head ${input.prompt_head_sha}`] : []),
      ...input.changed_files,
      ...input.executable_artifacts,
      ...input.routing_artifacts,
    ],
    blockers: [],
    next_route: "after this commit moves the branch, read only checks bound to the new PR head",
  };
}
