export type ScheduledMovedHeadEntryStatusVerdict =
  | "passing"
  | "passing_with_warnings"
  | "pending"
  | "failing"
  | "no_status_surface";

export type ScheduledMovedHeadEntryAction =
  | "read_live_head_status"
  | "commit_live_head_embodiment"
  | "emit_exact_external_blocker"
  | "block_non_progress_route"
  | "block_branch_mismatch"
  | "block_stale_status_surface"
  | "block_live_status_not_ready"
  | "block_incomplete_embodiment"
  | "block_missing_exact_blocker";

export type ScheduledMovedHeadProgressClass =
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
  | "replayed_repaired_head_blocker";

export interface ScheduledMovedHeadStatusSurface {
  surface_id: string;
  head_sha: string;
  verdict: ScheduledMovedHeadEntryStatusVerdict;
  decisive_successes: string[];
  blocking_failures: string[];
  pending_surfaces: string[];
  non_blocking_warnings: string[];
}

export interface ScheduledMovedHeadEmbodimentCandidate {
  candidate_id: string;
  progress_class: ScheduledMovedHeadProgressClass;
  branch: string;
  base_head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  route_signature?: string;
  blocker?: string;
}

export interface ScheduledMovedHeadEntryInput {
  active_branch: string;
  pr_branch: string;
  prompt_head_sha: string;
  live_head_sha: string;
  last_status_readback_head_sha?: string;
  resolved_repaired_head_sha?: string;
  exhausted_route_signatures?: string[];
  prohibited_progress_classes?: ScheduledMovedHeadProgressClass[];
  status_surface?: ScheduledMovedHeadStatusSurface;
  candidate: ScheduledMovedHeadEmbodimentCandidate;
}

export interface ScheduledMovedHeadEntryVerdict {
  ok: boolean;
  action: ScheduledMovedHeadEntryAction;
  branch: string;
  head_sha: string;
  quarantined_prompt_head_sha: string | null;
  expired_readback_head_sha: string | null;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

const NON_PROGRESS_CLASSES = new Set<ScheduledMovedHeadProgressClass>([
  "metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "guessed_future_ci",
  "reclose_completed_blocker",
  "replayed_repaired_head_blocker",
]);

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function proofOnlyPath(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function surfacePassing(surface: ScheduledMovedHeadStatusSurface): boolean {
  return (
    (surface.verdict === "passing" || surface.verdict === "passing_with_warnings") &&
    surface.decisive_successes.length > 0 &&
    surface.blocking_failures.length === 0 &&
    surface.pending_surfaces.length === 0
  );
}

function surfaceBlockers(surface: ScheduledMovedHeadStatusSurface): string[] {
  return [
    ...surface.blocking_failures,
    ...surface.pending_surfaces,
    ...(surface.decisive_successes.length === 0 ? ["live-head status surface has no decisive success evidence"] : []),
    ...(surface.verdict === "pending" ? ["live-head status surface is pending"] : []),
    ...(surface.verdict === "failing" ? ["live-head status surface is failing"] : []),
    ...(surface.verdict === "no_status_surface" ? ["live-head status surface is missing"] : []),
  ];
}

function base(input: ScheduledMovedHeadEntryInput): Pick<
  ScheduledMovedHeadEntryVerdict,
  "branch" | "head_sha" | "quarantined_prompt_head_sha" | "expired_readback_head_sha" | "warnings"
> {
  return {
    branch: input.pr_branch,
    head_sha: input.live_head_sha,
    quarantined_prompt_head_sha: input.prompt_head_sha === input.live_head_sha ? null : input.prompt_head_sha,
    expired_readback_head_sha:
      input.last_status_readback_head_sha && input.last_status_readback_head_sha !== input.live_head_sha
        ? input.last_status_readback_head_sha
        : null,
    warnings: input.status_surface?.non_blocking_warnings ?? [],
  };
}

function block(
  input: ScheduledMovedHeadEntryInput,
  action: Exclude<
    ScheduledMovedHeadEntryAction,
    "read_live_head_status" | "commit_live_head_embodiment" | "emit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ScheduledMovedHeadEntryVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function incompleteEmbodiment(candidate: ScheduledMovedHeadEmbodimentCandidate): string[] {
  const executableChanges = candidate.changed_files.filter(executablePlatformPath);
  const behaviorChanges = executableChanges.filter((path) => !proofOnlyPath(path));
  const blockers: string[] = [];

  if (candidate.progress_class !== "external_platform_embodiment") {
    blockers.push(`embodiment candidate has wrong progress class: ${candidate.progress_class}`);
  }
  if (executableChanges.length === 0) blockers.push("embodiment changes no executable platform file");
  if (executableChanges.length > 0 && behaviorChanges.length === 0) {
    blockers.push("embodiment is proof-only and has no behavior file");
  }
  if (candidate.executable_artifacts.length === 0) blockers.push("embodiment has no executable artifact evidence");
  if (candidate.routing_artifacts.length === 0) blockers.push("embodiment has no future-routing artifact evidence");
  if (candidate.proof_artifacts.length === 0) blockers.push("embodiment has no proof artifact evidence");

  return blockers;
}

export function routeScheduledMovedHeadEntry(input: ScheduledMovedHeadEntryInput): ScheduledMovedHeadEntryVerdict {
  const candidate = input.candidate;
  const prohibited = new Set(input.prohibited_progress_classes ?? []);
  const exhaustedRoutes = new Set(input.exhausted_route_signatures ?? []);
  const promptHeadMoved = input.prompt_head_sha !== input.live_head_sha;
  const readbackExpired = input.last_status_readback_head_sha !== input.live_head_sha;

  if (input.pr_branch !== input.active_branch || candidate.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`scheduled entry is not bound to active branch ${input.active_branch}`],
      "bind the scheduled entry, PR branch, and candidate to the active manifestation branch",
    );
  }

  if (NON_PROGRESS_CLASSES.has(candidate.progress_class) || prohibited.has(candidate.progress_class)) {
    return block(
      input,
      "block_non_progress_route",
      [`scheduled entry requested prohibited or non-progress class: ${candidate.progress_class}`],
      "choose live-head status readback, live-head embodiment, or one exact live-head blocker",
      [
        ...(input.resolved_repaired_head_sha ? [`resolved repaired head ${input.resolved_repaired_head_sha}`] : []),
        `live head ${input.live_head_sha}`,
      ],
    );
  }

  if (candidate.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_incomplete_embodiment",
      [`candidate base ${candidate.base_head_sha} is not live head ${input.live_head_sha}`],
      "rebase the scheduled candidate to the live PR head before release",
      promptHeadMoved ? [`quarantined prompt head ${input.prompt_head_sha}`] : [],
    );
  }

  if (candidate.progress_class === "exact_external_blocker") {
    const blocker = candidate.blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_missing_exact_blocker",
        ["exact external blocker candidate has no blocker text"],
        "name one exact live-head blocker or choose live-head readback",
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

  if (surface && surface.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_status_surface",
      [`status surface ${surface.surface_id} belongs to ${surface.head_sha}, not live head ${input.live_head_sha}`],
      "discard stale status evidence and read status for the live PR head",
      [surface.surface_id],
    );
  }

  if (!surface && (promptHeadMoved || readbackExpired || candidate.progress_class === "fresh_status_readback")) {
    return {
      ...base(input),
      ok: true,
      action: "read_live_head_status",
      decisive_evidence: [
        ...(promptHeadMoved ? [`prompt head ${input.prompt_head_sha} quarantined under live head ${input.live_head_sha}`] : []),
        ...(readbackExpired
          ? [`status readback head ${input.last_status_readback_head_sha ?? "<none>"} expired under live head ${input.live_head_sha}`]
          : []),
      ],
      blockers: [],
      next_route: "obtain one status surface for the live PR head before claiming status or committing another embodiment",
    };
  }

  if (surface && !surfacePassing(surface)) {
    return block(
      input,
      "block_live_status_not_ready",
      surfaceBlockers(surface),
      "wait for or repair the live-head status surface before committing embodiment",
      [surface.surface_id],
    );
  }

  if (candidate.progress_class === "fresh_status_readback") {
    return {
      ...base(input),
      ok: true,
      action: "read_live_head_status",
      decisive_evidence: surface ? [surface.surface_id, ...surface.decisive_successes] : [],
      blockers: [],
      next_route: "publish only this live-head status readback, then select a non-repeated executable embodiment",
    };
  }

  const routeSignature = candidate.route_signature?.trim();
  if (routeSignature && exhaustedRoutes.has(routeSignature)) {
    return block(
      input,
      "block_non_progress_route",
      [`scheduled entry repeats exhausted route signature: ${routeSignature}`],
      "choose an unspent behavior-bearing route signature before moving the branch",
    );
  }

  const embodimentBlockers = incompleteEmbodiment(candidate);
  if (embodimentBlockers.length > 0) {
    return block(
      input,
      "block_incomplete_embodiment",
      embodimentBlockers,
      "supply a behavior-bearing executable embodiment with routing and proof evidence",
      surface ? [surface.surface_id] : [],
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "commit_live_head_embodiment",
    decisive_evidence: [
      ...(surface ? [surface.surface_id, ...surface.decisive_successes] : []),
      ...(routeSignature ? [`route signature ${routeSignature}`] : []),
      ...candidate.changed_files.filter(executablePlatformPath),
      ...candidate.executable_artifacts,
      ...candidate.routing_artifacts,
      ...candidate.proof_artifacts,
    ],
    blockers: [],
    next_route: "commit the live-head embodiment, then read status only for the moved head",
  };
}
