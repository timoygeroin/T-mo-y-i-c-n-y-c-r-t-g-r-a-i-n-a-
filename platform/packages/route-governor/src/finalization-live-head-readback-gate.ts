export type LiveHeadReadbackGateMoveClass =
  | "fresh_status_readback"
  | "external_platform_embodiment"
  | "exact_external_blocker"
  | "duplicate_ci_summary"
  | "duplicate_comment"
  | "metadata_reread"
  | "repaired_head_blocker"
  | "guessed_future_ci";

export type LiveHeadReadbackGateAction =
  | "admit_live_head_status_readback"
  | "route_to_external_embodiment"
  | "emit_exact_external_blocker"
  | "block_non_progress_move"
  | "block_stale_status_surface"
  | "block_missing_readback_evidence"
  | "block_replayed_readback";

export interface LiveHeadReadbackStatusSurface {
  surface_id: string;
  head_sha: string;
  check_run_ids: string[];
  workflow_run_ids: string[];
  observed_at: string;
}

export interface LiveHeadReadbackGateInput {
  branch: string;
  active_branch: string;
  prompt_head_sha: string;
  live_head_sha: string;
  previous_readback_head_sha: string;
  resolved_repaired_head_sha: string;
  move_class: LiveHeadReadbackGateMoveClass;
  readback_id: string;
  spent_readback_ids: string[];
  status_surface?: LiveHeadReadbackStatusSurface;
  exact_blocker?: string;
}

export interface LiveHeadReadbackCommand {
  operation: "read_current_head_status";
  readback_id: string;
  branch: string;
  expected_head_sha: string;
  accepted_status_surface_ids: string[];
  forbidden_sources: string[];
}

export interface LiveHeadReadbackGateVerdict {
  ok: boolean;
  action: LiveHeadReadbackGateAction;
  branch: string;
  head_sha: string;
  command: LiveHeadReadbackCommand | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_MOVES = new Set<LiveHeadReadbackGateMoveClass>([
  "duplicate_ci_summary",
  "duplicate_comment",
  "metadata_reread",
  "repaired_head_blocker",
  "guessed_future_ci",
]);

function evidence(input: LiveHeadReadbackGateInput): string[] {
  return [
    `branch ${input.branch}`,
    `prompt head ${input.prompt_head_sha}`,
    `previous readback head ${input.previous_readback_head_sha}`,
    `live head ${input.live_head_sha}`,
    `move ${input.move_class}`,
  ];
}

function block(
  input: LiveHeadReadbackGateInput,
  action: Exclude<
    LiveHeadReadbackGateAction,
    "admit_live_head_status_readback" | "route_to_external_embodiment" | "emit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  extraEvidence: string[] = [],
): LiveHeadReadbackGateVerdict {
  return {
    ok: false,
    action,
    branch: input.branch,
    head_sha: input.live_head_sha,
    command: null,
    decisive_evidence: [...evidence(input), ...extraEvidence],
    blockers,
    next_route: nextRoute,
  };
}

function surfaceEvidence(surface: LiveHeadReadbackStatusSurface): string[] {
  return [
    surface.surface_id,
    `surface head ${surface.head_sha}`,
    `observed ${surface.observed_at}`,
    ...surface.check_run_ids.map((id) => `check:${id}`),
    ...surface.workflow_run_ids.map((id) => `workflow:${id}`),
  ];
}

export function compileLiveHeadReadbackGate(input: LiveHeadReadbackGateInput): LiveHeadReadbackGateVerdict {
  if (input.branch !== input.active_branch) {
    return block(
      input,
      "block_missing_readback_evidence",
      [`branch ${input.branch} is not active branch ${input.active_branch}`],
      "bind the readback gate to the active manifestation branch",
    );
  }

  if (NON_PROGRESS_MOVES.has(input.move_class)) {
    return block(
      input,
      "block_non_progress_move",
      [`move class cannot become Loading 20 progress: ${input.move_class}`],
      "choose fresh live-head readback, executable embodiment, or one exact external blocker",
    );
  }

  if (input.move_class === "external_platform_embodiment") {
    return {
      ok: true,
      action: "route_to_external_embodiment",
      branch: input.branch,
      head_sha: input.live_head_sha,
      command: null,
      decisive_evidence: evidence(input),
      blockers: [],
      next_route: "write a behavior-bearing platform change, then bind status readback to the moved head",
    };
  }

  if (input.move_class === "exact_external_blocker") {
    const blocker = input.exact_blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_missing_readback_evidence",
        ["exact blocker move has no blocker text"],
        "name the exact external blocker or choose a readback/embodiment move",
      );
    }

    return {
      ok: true,
      action: "emit_exact_external_blocker",
      branch: input.branch,
      head_sha: input.live_head_sha,
      command: null,
      decisive_evidence: [...evidence(input), blocker],
      blockers: [blocker],
      next_route: "remove the named blocker before attempting another readback or embodiment move",
    };
  }

  const readbackId = input.readback_id.trim();
  if (!readbackId || input.spent_readback_ids.includes(readbackId)) {
    return block(
      input,
      "block_replayed_readback",
      [readbackId ? `readback id already spent: ${readbackId}` : "readback id is missing"],
      "compile a fresh readback id for the live PR head",
    );
  }

  const headMovedFromPrompt = input.live_head_sha !== input.prompt_head_sha;
  const headMovedFromPreviousReadback = input.live_head_sha !== input.previous_readback_head_sha;
  if (!headMovedFromPrompt && !headMovedFromPreviousReadback && !input.status_surface) {
    return block(
      input,
      "block_missing_readback_evidence",
      ["fresh readback requires a moved PR head or a concrete new status surface"],
      "wait for head movement/new status evidence or choose executable embodiment",
    );
  }

  if (input.live_head_sha === input.resolved_repaired_head_sha) {
    return block(
      input,
      "block_non_progress_move",
      [`live head is the already resolved repaired head ${input.resolved_repaired_head_sha}`],
      "do not resurrect the repaired-head blocker as a fresh readback",
    );
  }

  const surface = input.status_surface;
  if (surface && surface.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_status_surface",
      [`status surface ${surface.surface_id} belongs to ${surface.head_sha}, not ${input.live_head_sha}`],
      "discard stale status evidence and read only the live PR head",
      surfaceEvidence(surface),
    );
  }

  const acceptedSurfaceIds = surface ? [surface.surface_id] : [];
  return {
    ok: true,
    action: "admit_live_head_status_readback",
    branch: input.branch,
    head_sha: input.live_head_sha,
    command: {
      operation: "read_current_head_status",
      readback_id: readbackId,
      branch: input.branch,
      expected_head_sha: input.live_head_sha,
      accepted_status_surface_ids: acceptedSurfaceIds,
      forbidden_sources: [
        input.resolved_repaired_head_sha,
        input.previous_readback_head_sha,
        "duplicate_ci_summary",
        "metadata_reread",
        "guessed_future_ci",
      ],
    },
    decisive_evidence: [
      ...evidence(input),
      readbackId,
      ...(headMovedFromPrompt ? [`live head moved from prompt head ${input.prompt_head_sha}`] : []),
      ...(headMovedFromPreviousReadback
        ? [`live head moved from previous readback ${input.previous_readback_head_sha}`]
        : []),
      ...(surface ? surfaceEvidence(surface) : []),
    ],
    blockers: [],
    next_route: "execute one status readback bound to expected_head_sha; any branch movement after that requires a new gate",
  };
}
