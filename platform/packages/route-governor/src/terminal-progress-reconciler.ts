export type TerminalProgressSurfaceKind =
  | "current_turn_gate"
  | "release_candidate_bundle"
  | "review_ready_boundary"
  | "direct_status_surface"
  | "exact_blocker";

export type TerminalProgressRequestedAction =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "merge_command"
  | "review_repair"
  | "wait_for_review"
  | "metadata_reread"
  | "duplicate_status_summary"
  | "duplicate_comment"
  | "local_memory_guard";

export type TerminalProgressAction =
  | "release_external_embodiment"
  | "publish_fresh_status_readback"
  | "emit_exact_external_blocker"
  | "admit_merge_command"
  | "route_review_repair"
  | "wait_for_external_review"
  | "block_non_progress_action"
  | "block_stale_surface"
  | "block_branch_mismatch"
  | "block_missing_live_surface"
  | "block_unreconciled_terminal_progress";

export interface TerminalProgressSurface {
  surface_id: string;
  kind: TerminalProgressSurfaceKind;
  branch: string;
  head_sha: string;
  ok: boolean;
  action: string;
  evidence: string[];
  blockers: string[];
  warnings?: string[];
}

export interface TerminalProgressReconcilerInput {
  active_branch: string;
  live_head_sha: string;
  requested_action: TerminalProgressRequestedAction;
  exhausted_actions: TerminalProgressRequestedAction[];
  surfaces: TerminalProgressSurface[];
}

export interface TerminalProgressReconcilerVerdict {
  ok: boolean;
  action: TerminalProgressAction;
  branch: string;
  head_sha: string;
  selected_surface_ids: string[];
  rejected_surface_ids: string[];
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

const NON_PROGRESS_ACTIONS = new Set<TerminalProgressRequestedAction>([
  "metadata_reread",
  "duplicate_status_summary",
  "duplicate_comment",
  "local_memory_guard",
]);

function base(input: TerminalProgressReconcilerInput): Pick<TerminalProgressReconcilerVerdict, "branch" | "head_sha"> {
  return { branch: input.active_branch, head_sha: input.live_head_sha };
}

function warnings(surfaces: TerminalProgressSurface[]): string[] {
  return [...new Set(surfaces.flatMap((surface) => surface.warnings ?? []))];
}

function sameSurface(input: TerminalProgressReconcilerInput, surface: TerminalProgressSurface): boolean {
  return surface.branch === input.active_branch && surface.head_sha === input.live_head_sha;
}

function liveSurfaces(input: TerminalProgressReconcilerInput): TerminalProgressSurface[] {
  return input.surfaces.filter((surface) => sameSurface(input, surface));
}

function block(
  input: TerminalProgressReconcilerInput,
  action: Exclude<
    TerminalProgressAction,
    | "release_external_embodiment"
    | "publish_fresh_status_readback"
    | "emit_exact_external_blocker"
    | "admit_merge_command"
    | "route_review_repair"
    | "wait_for_external_review"
  >,
  blockers: string[],
  nextRoute: string,
  selected: TerminalProgressSurface[] = [],
): TerminalProgressReconcilerVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    selected_surface_ids: selected.map((surface) => surface.surface_id),
    rejected_surface_ids: input.surfaces
      .filter((surface) => !sameSurface(input, surface) || !surface.ok || surface.blockers.length > 0)
      .map((surface) => surface.surface_id),
    decisive_evidence: selected.flatMap((surface) => [surface.surface_id, surface.action, ...surface.evidence]),
    blockers,
    warnings: warnings(input.surfaces),
    next_route: nextRoute,
  };
}

function surfaceFor(input: TerminalProgressReconcilerInput, kind: TerminalProgressSurfaceKind): TerminalProgressSurface | undefined {
  return liveSurfaces(input).find((surface) => surface.kind === kind && surface.ok && surface.blockers.length === 0);
}

function admit(
  input: TerminalProgressReconcilerInput,
  action: Exclude<
    TerminalProgressAction,
    | "block_non_progress_action"
    | "block_stale_surface"
    | "block_branch_mismatch"
    | "block_missing_live_surface"
    | "block_unreconciled_terminal_progress"
  >,
  selected: TerminalProgressSurface[],
  nextRoute: string,
  blockers: string[] = [],
): TerminalProgressReconcilerVerdict {
  return {
    ...base(input),
    ok: blockers.length === 0,
    action,
    selected_surface_ids: selected.map((surface) => surface.surface_id),
    rejected_surface_ids: input.surfaces
      .filter((surface) => !selected.includes(surface) && (!sameSurface(input, surface) || !surface.ok || surface.blockers.length > 0))
      .map((surface) => surface.surface_id),
    decisive_evidence: selected.flatMap((surface) => [surface.surface_id, surface.action, ...surface.evidence]),
    blockers,
    warnings: warnings(selected),
    next_route: nextRoute,
  };
}

export function reconcileTerminalProgress(
  input: TerminalProgressReconcilerInput,
): TerminalProgressReconcilerVerdict {
  if (NON_PROGRESS_ACTIONS.has(input.requested_action) || input.exhausted_actions.includes(input.requested_action)) {
    return block(
      input,
      "block_non_progress_action",
      [`terminal action is exhausted or non-progress: ${input.requested_action}`],
      "choose an executable embodiment, fresh live-head status readback, review repair, merge command, wait boundary, or exact blocker",
    );
  }

  const branchMismatch = input.surfaces.find((surface) => surface.branch !== input.active_branch);
  if (branchMismatch) {
    return block(
      input,
      "block_branch_mismatch",
      [`surface ${branchMismatch.surface_id} is on ${branchMismatch.branch}, not ${input.active_branch}`],
      "rebuild terminal progress from the active branch only",
    );
  }

  const stale = input.surfaces.find((surface) => surface.head_sha !== input.live_head_sha);
  if (stale) {
    return block(
      input,
      "block_stale_surface",
      [`surface ${stale.surface_id} belongs to ${stale.head_sha}, not live head ${input.live_head_sha}`],
      "refresh every terminal surface against the same live head before selecting a terminal action",
    );
  }

  const currentTurn = surfaceFor(input, "current_turn_gate");
  if (!currentTurn) {
    return block(
      input,
      "block_missing_live_surface",
      [`no admitted current-turn gate is bound to ${input.active_branch}@${input.live_head_sha}`],
      "obtain an admitted current-turn gate before terminal reconciliation",
    );
  }

  if (input.requested_action === "exact_external_blocker") {
    const blocker = surfaceFor(input, "exact_blocker");
    if (!blocker) {
      return block(input, "block_missing_live_surface", ["exact blocker action has no live exact-blocker surface"], "attach the exact external blocker surface", [currentTurn]);
    }
    return admit(input, "emit_exact_external_blocker", [currentTurn, blocker], "resolve the named blocker before another terminal action", blocker.blockers);
  }

  if (input.requested_action === "fresh_status_readback") {
    const status = surfaceFor(input, "direct_status_surface");
    if (!status) {
      return block(input, "block_missing_live_surface", ["fresh status readback has no direct live-head status surface"], "read direct live-head Checks or Actions before status release", [currentTurn]);
    }
    return admit(input, "publish_fresh_status_readback", [currentTurn, status], "after status release, select only a non-repeated embodiment, review action, merge command, or exact blocker");
  }

  if (input.requested_action === "external_platform_embodiment") {
    return admit(input, "release_external_embodiment", [currentTurn], "commit the behavior-bearing embodiment and bind the next readback to the resulting head");
  }

  const bundle = surfaceFor(input, "release_candidate_bundle");
  const review = surfaceFor(input, "review_ready_boundary");

  if (input.requested_action === "merge_command") {
    if (!bundle) {
      return block(input, "block_missing_live_surface", ["merge command has no admitted release-candidate bundle"], "bundle live-head status, mergeability, and review leases before merge command", [currentTurn]);
    }
    return admit(input, "admit_merge_command", [currentTurn, bundle], "consume the merge command only while the bundle head remains live");
  }

  if (input.requested_action === "review_repair") {
    if (!review) {
      return block(input, "block_missing_live_surface", ["review repair has no live review-ready boundary surface"], "attach live-head review feedback before routing repair", [currentTurn]);
    }
    return admit(input, "route_review_repair", [currentTurn, review], "repair only the files named by live-head review feedback");
  }

  if (input.requested_action === "wait_for_review") {
    if (!review) {
      return block(input, "block_missing_live_surface", ["wait-for-review has no live review-ready boundary surface"], "attach a live review boundary before declaring wait state", [currentTurn]);
    }
    return admit(input, "wait_for_external_review", [currentTurn, review], "do not replace external review wait with duplicate comments or status summaries");
  }

  return block(
    input,
    "block_unreconciled_terminal_progress",
    [`terminal action cannot be reconciled: ${input.requested_action}`],
    "supply one terminal progress action with matching live-head surfaces",
    [currentTurn],
  );
}
