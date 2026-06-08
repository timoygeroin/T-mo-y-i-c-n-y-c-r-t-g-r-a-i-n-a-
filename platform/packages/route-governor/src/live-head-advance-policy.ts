export type LiveHeadStatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "no_status_surface";

export type LiveHeadAdvanceAction =
  | "read_live_head_status"
  | "repair_live_head_failure"
  | "continue_external_embodiment"
  | "wait_for_live_head_checks"
  | "block_stale_status_surface"
  | "block_repeated_finalization_class";

export interface LiveHeadStatusSurface {
  head_sha: string;
  verdict: LiveHeadStatusVerdict;
  decisive_successes: string[];
  blocking_failures: string[];
  pending_surfaces: string[];
  non_blocking_warnings: string[];
}

export interface LiveHeadFailureSurface {
  surface_id: string;
  head_sha: string;
  check_name: string;
  failed_step?: string;
  assertion?: string;
  log_excerpt?: string;
}

export interface LiveHeadAdvanceInput {
  branch: string;
  active_branch: string;
  prompt_head_sha: string;
  live_head_sha: string;
  repaired_head_sha: string;
  repaired_head_status_resolved: boolean;
  attempted_move_class: string;
  prohibited_move_classes: string[];
  status_surface?: LiveHeadStatusSurface;
  failure_surfaces: LiveHeadFailureSurface[];
}

export interface LiveHeadAdvanceVerdict {
  ok: boolean;
  action: LiveHeadAdvanceAction;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

function base(input: LiveHeadAdvanceInput): Pick<LiveHeadAdvanceVerdict, "branch" | "head_sha" | "warnings"> {
  return {
    branch: input.branch,
    head_sha: input.live_head_sha,
    warnings: input.status_surface?.non_blocking_warnings ?? [],
  };
}

function block(
  input: LiveHeadAdvanceInput,
  action: Extract<LiveHeadAdvanceAction, "block_stale_status_surface" | "block_repeated_finalization_class">,
  blockers: string[],
  nextRoute: string,
): LiveHeadAdvanceVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: [],
    blockers,
    next_route: nextRoute,
  };
}

function surfaceLabel(surface: LiveHeadFailureSurface): string {
  return [surface.surface_id, surface.check_name, surface.failed_step ? `step=${surface.failed_step}` : null]
    .filter((value): value is string => value !== null)
    .join("; ");
}

function actionableFailure(surface: LiveHeadFailureSurface): string | null {
  return surface.assertion?.trim() || surface.log_excerpt?.trim() || null;
}

function liveFailures(input: LiveHeadAdvanceInput): LiveHeadFailureSurface[] {
  return input.failure_surfaces.filter((surface) => surface.head_sha === input.live_head_sha);
}

function headMovedPastResolvedRepair(input: LiveHeadAdvanceInput): boolean {
  return (
    input.repaired_head_status_resolved &&
    input.prompt_head_sha === input.repaired_head_sha &&
    input.live_head_sha !== input.repaired_head_sha
  );
}

export function routeLiveHeadAdvance(input: LiveHeadAdvanceInput): LiveHeadAdvanceVerdict {
  if (input.branch !== input.active_branch) {
    return block(
      input,
      "block_repeated_finalization_class",
      [`live-head advance branch ${input.branch} does not match active branch ${input.active_branch}`],
      "rebind the live-head policy to the active PR branch",
    );
  }

  if (input.prohibited_move_classes.includes(input.attempted_move_class)) {
    return block(
      input,
      "block_repeated_finalization_class",
      [`attempted finalization move is prohibited or already exhausted: ${input.attempted_move_class}`],
      "choose live-head status, live-head repair, or non-repeated executable embodiment",
    );
  }

  const surface = input.status_surface;
  if (surface && surface.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_status_surface",
      [`status surface belongs to ${surface.head_sha}, not live head ${input.live_head_sha}`],
      "discard stale status evidence and bind the next readback to the live PR head",
    );
  }

  if (!surface) {
    return {
      ...base(input),
      ok: headMovedPastResolvedRepair(input),
      action: "read_live_head_status",
      decisive_evidence: headMovedPastResolvedRepair(input)
        ? [`live head ${input.live_head_sha} supersedes resolved repaired head ${input.repaired_head_sha}`]
        : [],
      blockers: headMovedPastResolvedRepair(input) ? [] : ["no live-head status surface is attached"],
      next_route: "obtain status evidence bound to the live PR head before status claims or repairs",
    };
  }

  if (surface.verdict === "pending") {
    return {
      ...base(input),
      ok: false,
      action: "wait_for_live_head_checks",
      decisive_evidence: surface.decisive_successes,
      blockers: surface.pending_surfaces.length > 0 ? surface.pending_surfaces : ["live-head checks are pending"],
      next_route: "wait for live-head checks to complete before embodiment or repair",
    };
  }

  if (surface.verdict === "failing") {
    const actionable = liveFailures(input).find((failure) => actionableFailure(failure));
    if (!actionable) {
      return {
        ...base(input),
        ok: false,
        action: "repair_live_head_failure",
        decisive_evidence: surface.blocking_failures,
        blockers: ["live head is failing but no actionable failure assertion or log excerpt is attached"],
        next_route: "obtain the concrete live-head failure line before editing code",
      };
    }

    return {
      ...base(input),
      ok: true,
      action: "repair_live_head_failure",
      decisive_evidence: [surfaceLabel(actionable), actionableFailure(actionable) ?? ""].filter((value) => value.length > 0),
      blockers: [],
      next_route: "repair only the actionable live-head failure and bind the next readback to the moved head",
    };
  }

  if (surface.verdict === "no_status_surface") {
    return {
      ...base(input),
      ok: false,
      action: "read_live_head_status",
      decisive_evidence: [],
      blockers: ["no live-head status surface is available"],
      next_route: "obtain Checks, Actions, or workflow-published readback evidence for the live head",
    };
  }

  return {
    ...base(input),
    ok: true,
    action: "continue_external_embodiment",
    decisive_evidence: [
      ...(headMovedPastResolvedRepair(input)
        ? [`live head ${input.live_head_sha} supersedes resolved repaired head ${input.repaired_head_sha}`]
        : []),
      ...surface.decisive_successes,
    ],
    blockers: [],
    next_route: "commit a non-repeated executable platform embodiment, then read checks bound to the new head",
  };
}
