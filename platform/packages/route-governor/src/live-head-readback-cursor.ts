export type LiveHeadReadbackVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "no_status_surface";

export type LiveHeadReadbackCursorAction =
  | "open_fresh_readback"
  | "accept_current_readback"
  | "block_branch_mismatch"
  | "block_replayed_repaired_head"
  | "block_stale_readback"
  | "block_pending_readback"
  | "block_empty_readback";

export interface LiveHeadReadbackSurface {
  head_sha: string;
  verdict: LiveHeadReadbackVerdict;
  decisive_successes: string[];
  blocking_failures: string[];
  pending_surfaces: string[];
  non_blocking_warnings: string[];
}

export interface LiveHeadReadbackCursorInput {
  branch: string;
  active_branch: string;
  repaired_head_sha: string;
  previous_known_head_sha: string;
  live_head_sha: string;
  previous_readback_head_sha: string;
  attempted_release_class: string;
  prohibited_release_classes: string[];
  status_surface?: LiveHeadReadbackSurface;
}

export interface LiveHeadReadbackCursorVerdict {
  ok: boolean;
  action: LiveHeadReadbackCursorAction;
  branch: string;
  head_sha: string;
  required_readback_head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

function base(input: LiveHeadReadbackCursorInput): Pick<
  LiveHeadReadbackCursorVerdict,
  "branch" | "head_sha" | "required_readback_head_sha" | "warnings"
> {
  return {
    branch: input.branch,
    head_sha: input.live_head_sha,
    required_readback_head_sha: input.live_head_sha,
    warnings: input.status_surface?.non_blocking_warnings ?? [],
  };
}

function block(
  input: LiveHeadReadbackCursorInput,
  action: Exclude<LiveHeadReadbackCursorAction, "open_fresh_readback" | "accept_current_readback">,
  blockers: string[],
  nextRoute: string,
): LiveHeadReadbackCursorVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: [],
    blockers,
    next_route: nextRoute,
  };
}

function headMoved(input: LiveHeadReadbackCursorInput): boolean {
  return input.live_head_sha !== input.previous_known_head_sha;
}

function replayingResolvedRepair(input: LiveHeadReadbackCursorInput): boolean {
  return (
    input.live_head_sha === input.repaired_head_sha &&
    input.previous_readback_head_sha === input.repaired_head_sha &&
    input.attempted_release_class.includes("repaired_head")
  );
}

export function compileLiveHeadReadbackCursor(
  input: LiveHeadReadbackCursorInput,
): LiveHeadReadbackCursorVerdict {
  if (input.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`live-head readback branch ${input.branch} does not match active branch ${input.active_branch}`],
      "bind readback only to the active PR branch before choosing status or embodiment",
    );
  }

  if (input.prohibited_release_classes.includes(input.attempted_release_class) || replayingResolvedRepair(input)) {
    return block(
      input,
      "block_replayed_repaired_head",
      [`release class is prohibited or already resolved: ${input.attempted_release_class}`],
      "discard the repaired-head blocker and use the live head as the only status target",
    );
  }

  const surface = input.status_surface;
  if (!surface) {
    if (!headMoved(input) && input.previous_readback_head_sha === input.live_head_sha) {
      return block(
        input,
        "block_replayed_repaired_head",
        [`head ${input.live_head_sha} already has a readback and did not move`],
        "choose a non-repeated executable embodiment or name the exact live external blocker",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "open_fresh_readback",
      decisive_evidence: [
        headMoved(input)
          ? `head moved from ${input.previous_known_head_sha} to ${input.live_head_sha}`
          : `previous readback ${input.previous_readback_head_sha} is not bound to live head ${input.live_head_sha}`,
      ],
      blockers: [],
      next_route: "read Checks, Actions, or workflow evidence for the live PR head before making any status claim",
    };
  }

  if (surface.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_readback",
      [`readback surface belongs to ${surface.head_sha}, not live head ${input.live_head_sha}`],
      "discard stale readback and obtain evidence for the live PR head",
    );
  }

  if (surface.verdict === "pending") {
    return block(
      input,
      "block_pending_readback",
      surface.pending_surfaces.length > 0 ? surface.pending_surfaces : [`live-head status is pending for ${input.live_head_sha}`],
      "wait for current-head checks to finish before status claims, repairs, or new embodiment",
    );
  }

  if (surface.verdict === "no_status_surface") {
    return block(
      input,
      "block_empty_readback",
      [`readback for ${input.live_head_sha} returned no status surface`],
      "obtain a concrete Checks, Actions, or workflow-published status surface for the live head",
    );
  }

  const decisive_evidence =
    surface.verdict === "failing"
      ? surface.blocking_failures
      : surface.decisive_successes.length > 0
        ? surface.decisive_successes
        : [`${input.live_head_sha} readback verdict: ${surface.verdict}`];

  return {
    ...base(input),
    ok: true,
    action: "accept_current_readback",
    decisive_evidence,
    blockers: surface.verdict === "failing" ? surface.blocking_failures : [],
    next_route:
      surface.verdict === "failing"
        ? "repair only the current-head failure surfaced by this readback"
        : "choose a non-repeated executable embodiment class after the current-head readback",
  };
}
