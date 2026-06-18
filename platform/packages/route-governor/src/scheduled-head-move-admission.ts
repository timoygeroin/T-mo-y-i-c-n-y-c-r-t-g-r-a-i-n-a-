export type ScheduledHeadMoveStatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "no_status_surface";

export type ScheduledHeadMoveClass = "external_platform_embodiment" | "fresh_status_readback" | "exact_external_blocker";

export type ScheduledHeadMoveAdmissionAction =
  | "admit_moved_head_status_readback"
  | "admit_current_head_embodiment"
  | "emit_exact_external_blocker"
  | "block_branch_mismatch"
  | "block_stale_candidate_base"
  | "block_stale_status_surface"
  | "block_live_status_not_ready"
  | "block_incomplete_embodiment"
  | "block_missing_exact_blocker";

export interface ScheduledHeadMoveStatusSurface {
  surface_id: string;
  head_sha: string;
  verdict: ScheduledHeadMoveStatusVerdict;
  decisive_successes: string[];
  blocking_failures: string[];
  pending_surfaces: string[];
  non_blocking_warnings: string[];
}

export interface ScheduledHeadMoveCandidate {
  move_class: ScheduledHeadMoveClass;
  branch: string;
  base_head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  blocker?: string;
}

export interface ScheduledHeadMoveAdmissionInput {
  active_branch: string;
  prompt_head_sha: string;
  live_head_sha: string;
  last_status_readback_head_sha?: string;
  candidate: ScheduledHeadMoveCandidate;
  status_surface?: ScheduledHeadMoveStatusSurface;
}

export interface ScheduledHeadMoveAdmissionVerdict {
  ok: boolean;
  action: ScheduledHeadMoveAdmissionAction;
  branch: string;
  head_sha: string;
  quarantined_prompt_head: string | null;
  expired_status_head_sha: string | null;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

function base(input: ScheduledHeadMoveAdmissionInput): Pick<
  ScheduledHeadMoveAdmissionVerdict,
  "branch" | "head_sha" | "quarantined_prompt_head" | "expired_status_head_sha" | "warnings"
> {
  return {
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    quarantined_prompt_head: input.prompt_head_sha === input.live_head_sha ? null : input.prompt_head_sha,
    expired_status_head_sha:
      input.last_status_readback_head_sha && input.last_status_readback_head_sha !== input.live_head_sha
        ? input.last_status_readback_head_sha
        : null,
    warnings: input.status_surface?.non_blocking_warnings ?? [],
  };
}

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function proofOnlyPath(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function statusPassing(surface: ScheduledHeadMoveStatusSurface): boolean {
  return (
    (surface.verdict === "passing" || surface.verdict === "passing_with_warnings") &&
    surface.decisive_successes.length > 0 &&
    surface.blocking_failures.length === 0 &&
    surface.pending_surfaces.length === 0
  );
}

function statusNotReadyBlockers(surface: ScheduledHeadMoveStatusSurface): string[] {
  return [
    ...surface.blocking_failures,
    ...surface.pending_surfaces,
    ...(surface.decisive_successes.length === 0 ? ["scheduled head-move status surface has no decisive success evidence"] : []),
    ...(surface.verdict === "pending" ? ["scheduled head-move status surface is pending"] : []),
    ...(surface.verdict === "failing" ? ["scheduled head-move status surface is failing"] : []),
    ...(surface.verdict === "no_status_surface" ? ["scheduled head-move status surface is missing"] : []),
  ];
}

function incompleteEmbodiment(candidate: ScheduledHeadMoveCandidate): string[] {
  const executableChanges = candidate.changed_files.filter(executablePlatformPath);
  const behaviorChanges = executableChanges.filter((path) => !proofOnlyPath(path));
  const blockers: string[] = [];

  if (executableChanges.length === 0) blockers.push("scheduled head-move embodiment changes no executable platform file");
  if (executableChanges.length > 0 && behaviorChanges.length === 0) {
    blockers.push("scheduled head-move embodiment is proof-only and has no behavior file");
  }
  if (candidate.executable_artifacts.length === 0) blockers.push("scheduled head-move embodiment has no executable artifact evidence");
  if (candidate.routing_artifacts.length === 0) blockers.push("scheduled head-move embodiment has no future-routing artifact evidence");
  if (candidate.proof_artifacts.length === 0) blockers.push("scheduled head-move embodiment has no proof artifact evidence");

  return blockers;
}

function block(
  input: ScheduledHeadMoveAdmissionInput,
  action: Exclude<
    ScheduledHeadMoveAdmissionAction,
    "admit_moved_head_status_readback" | "admit_current_head_embodiment" | "emit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ScheduledHeadMoveAdmissionVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

export function admitScheduledHeadMove(input: ScheduledHeadMoveAdmissionInput): ScheduledHeadMoveAdmissionVerdict {
  const candidate = input.candidate;

  if (candidate.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`],
      "bind scheduled head-move progress to the active PR branch before release",
    );
  }

  if (candidate.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_candidate_base",
      [`candidate base ${candidate.base_head_sha} is not live head ${input.live_head_sha}`],
      "rebase the scheduled candidate to the live PR head; quarantine prompt-carried heads as historical only",
      [`prompt head ${input.prompt_head_sha}`, `live head ${input.live_head_sha}`],
    );
  }

  if (candidate.move_class === "exact_external_blocker") {
    const blocker = candidate.blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_missing_exact_blocker",
        ["scheduled head-move exact blocker candidate has no blocker text"],
        "name one exact live-head blocker or choose moved-head status readback",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_exact_external_blocker",
      decisive_evidence: [blocker, `live head ${input.live_head_sha}`],
      blockers: [blocker],
      next_route: "remove the named live-head blocker before another scheduled finalization move",
    };
  }

  const surface = input.status_surface;
  const headMovedSincePrompt = input.prompt_head_sha !== input.live_head_sha;
  const headMovedSinceReadback = input.last_status_readback_head_sha !== input.live_head_sha;

  if (surface && surface.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_status_surface",
      [`status surface ${surface.surface_id} belongs to ${surface.head_sha}, not live head ${input.live_head_sha}`],
      "discard stale status evidence and read status for the live PR head",
      [surface.surface_id],
    );
  }

  if (candidate.move_class === "fresh_status_readback") {
    if (!headMovedSincePrompt && !headMovedSinceReadback && !surface) {
      return block(
        input,
        "block_stale_status_surface",
        ["scheduled head-move readback has no moved head and no live status surface"],
        "commit a real embodiment or provide current-head status evidence before readback",
      );
    }

    if (surface && !statusPassing(surface)) {
      return block(
        input,
        "block_live_status_not_ready",
        statusNotReadyBlockers(surface),
        "wait for or repair the live-head status surface before publishing readback",
        [surface.surface_id],
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_moved_head_status_readback",
      decisive_evidence: [
        ...(headMovedSincePrompt ? [`prompt head ${input.prompt_head_sha} quarantined under live head ${input.live_head_sha}`] : []),
        ...(headMovedSinceReadback
          ? [`status readback head ${input.last_status_readback_head_sha ?? "<none>"} expired under ${input.live_head_sha}`]
          : []),
        ...(surface ? [surface.surface_id, ...surface.decisive_successes] : []),
      ],
      blockers: [],
      next_route: "perform one live-head status readback, then select a non-repeated executable embodiment",
    };
  }

  if (surface && !statusPassing(surface)) {
    return block(
      input,
      "block_live_status_not_ready",
      statusNotReadyBlockers(surface),
      "do not admit embodiment until live-head status is passing or an exact blocker is emitted",
      [surface.surface_id],
    );
  }

  if (!surface && (headMovedSincePrompt || headMovedSinceReadback)) {
    return {
      ...base(input),
      ok: true,
      action: "admit_moved_head_status_readback",
      decisive_evidence: [
        ...(headMovedSincePrompt ? [`prompt head ${input.prompt_head_sha} quarantined under live head ${input.live_head_sha}`] : []),
        ...(headMovedSinceReadback
          ? [`status readback head ${input.last_status_readback_head_sha ?? "<none>"} expired under ${input.live_head_sha}`]
          : []),
      ],
      blockers: [],
      next_route: "read live-head status before executable embodiment because the scheduled run began from an older head",
    };
  }

  const blockers = incompleteEmbodiment(candidate);
  if (blockers.length > 0) {
    return block(
      input,
      "block_incomplete_embodiment",
      blockers,
      "supply behavior-bearing executable, routing, and proof evidence before moving the branch",
      surface ? [surface.surface_id, ...surface.decisive_successes] : [],
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_current_head_embodiment",
    decisive_evidence: [
      ...(surface ? [surface.surface_id, ...surface.decisive_successes] : []),
      ...candidate.changed_files.filter(executablePlatformPath),
      ...candidate.executable_artifacts,
      ...candidate.routing_artifacts,
      ...candidate.proof_artifacts,
    ],
    blockers: [],
    next_route: "commit the current-head embodiment, then bind the next readback to the moved head only",
  };
}
