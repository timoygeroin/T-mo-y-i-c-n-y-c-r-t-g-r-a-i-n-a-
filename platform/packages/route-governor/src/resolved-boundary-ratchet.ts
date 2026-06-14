export type ResolvedBoundaryNextMoveClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "repaired_head_blocker_replay"
  | "duplicate_ci_summary"
  | "pr_metadata_reread"
  | "duplicate_comment"
  | "duplicate_label"
  | "local_memory_guard"
  | "warning_maintenance";

export type ResolvedBoundaryRatchetAction =
  | "advance_to_external_embodiment"
  | "advance_to_fresh_live_head_readback"
  | "advance_to_exact_external_blocker"
  | "block_unresolved_boundary"
  | "block_repaired_head_replay"
  | "block_non_progress_move"
  | "block_stale_head_authority"
  | "block_incomplete_embodiment"
  | "block_missing_exact_blocker";

export interface ResolvedBoundaryCheckReceipt {
  id: string;
  head_sha: string;
  conclusion: "success" | "failure" | "cancelled" | "skipped" | "neutral" | "timed_out" | "action_required" | null;
}

export interface ResolvedBoundaryState {
  active_branch: string;
  live_head_sha: string;
  repaired_head_sha: string;
  resolved_repaired_head_sha: string;
  issue_closed: boolean;
  blocker_label_removed: boolean;
  pr_ready_for_review: boolean;
  repaired_head_checks: ResolvedBoundaryCheckReceipt[];
}

export interface ResolvedBoundaryNextMove {
  move_id: string;
  move_class: ResolvedBoundaryNextMoveClass;
  branch: string;
  base_head_sha: string;
  status_head_sha?: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  blocker?: string;
}

export interface ResolvedBoundaryRatchetVerdict {
  ok: boolean;
  action: ResolvedBoundaryRatchetAction;
  branch: string;
  live_head_sha: string;
  repaired_head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_MOVES = new Set<ResolvedBoundaryNextMoveClass>([
  "duplicate_ci_summary",
  "pr_metadata_reread",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "warning_maintenance",
]);

function behaviorFile(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path) && !/(?:\.test|-proof)\.ts$/.test(path);
}

function base(
  state: ResolvedBoundaryState,
  action: ResolvedBoundaryRatchetAction,
  ok: boolean,
  decisiveEvidence: string[],
  blockers: string[],
  nextRoute: string,
): ResolvedBoundaryRatchetVerdict {
  return {
    ok,
    action,
    branch: state.active_branch,
    live_head_sha: state.live_head_sha,
    repaired_head_sha: state.repaired_head_sha,
    decisive_evidence: decisiveEvidence,
    blockers,
    next_route: nextRoute,
  };
}

function unresolvedBoundaryBlockers(state: ResolvedBoundaryState): string[] {
  const blockers: string[] = [];
  const repairedHeadSuccesses = state.repaired_head_checks.filter(
    (check) => check.head_sha === state.repaired_head_sha && check.conclusion === "success",
  );

  if (state.resolved_repaired_head_sha !== state.repaired_head_sha) {
    blockers.push(
      `resolved repaired head ${state.resolved_repaired_head_sha} does not match repaired head ${state.repaired_head_sha}`,
    );
  }
  if (repairedHeadSuccesses.length === 0) {
    blockers.push("resolved boundary has no successful repaired-head check receipts");
  }
  if (!state.issue_closed) blockers.push("resolved boundary issue is not closed");
  if (!state.blocker_label_removed) blockers.push("resolved boundary blocker label is still present");
  if (!state.pr_ready_for_review) blockers.push("PR is not ready for review after repaired-head resolution");

  return blockers;
}

function evidenceForResolvedBoundary(state: ResolvedBoundaryState): string[] {
  return [
    `repaired head ${state.repaired_head_sha}`,
    ...state.repaired_head_checks
      .filter((check) => check.head_sha === state.repaired_head_sha && check.conclusion === "success")
      .map((check) => `successful repaired-head check ${check.id}`),
    "blocker issue closed",
    "ci-status-readback label removed",
    "PR ready for review",
  ];
}

export function routeResolvedBoundaryRatchet(
  state: ResolvedBoundaryState,
  move: ResolvedBoundaryNextMove,
): ResolvedBoundaryRatchetVerdict {
  if (move.branch !== state.active_branch) {
    return base(
      state,
      "block_stale_head_authority",
      false,
      [],
      [`move branch ${move.branch} does not match active branch ${state.active_branch}`],
      "bind the next move to the active manifestation branch",
    );
  }

  const boundaryBlockers = unresolvedBoundaryBlockers(state);
  if (boundaryBlockers.length > 0) {
    return base(
      state,
      "block_unresolved_boundary",
      false,
      [],
      boundaryBlockers,
      "resolve the repaired-head boundary before retiring its blocker family",
    );
  }

  const resolvedEvidence = evidenceForResolvedBoundary(state);

  if (move.move_class === "repaired_head_blocker_replay") {
    return base(
      state,
      "block_repaired_head_replay",
      false,
      resolvedEvidence,
      [`repaired-head blocker is already resolved for ${state.repaired_head_sha}`],
      "advance to a new embodiment, live-head readback, or exact blocker; do not replay the resolved blocker",
    );
  }

  if (NON_PROGRESS_MOVES.has(move.move_class)) {
    return base(
      state,
      "block_non_progress_move",
      false,
      resolvedEvidence,
      [`move class is non-progress after boundary resolution: ${move.move_class}`],
      "choose external embodiment, fresh live-head readback, or one exact blocker",
    );
  }

  if (move.base_head_sha !== state.live_head_sha) {
    return base(
      state,
      "block_stale_head_authority",
      false,
      resolvedEvidence,
      [`move base ${move.base_head_sha} is not live head ${state.live_head_sha}`],
      "rebase the next move to the current PR head before release",
    );
  }

  if (move.move_class === "external_platform_embodiment") {
    const blockers: string[] = [];
    if (!move.changed_files.some(behaviorFile)) blockers.push("external embodiment has no behavior-bearing platform file");
    if (move.executable_artifacts.length === 0) blockers.push("external embodiment has no executable artifact");
    if (move.routing_artifacts.length === 0) blockers.push("external embodiment has no future-routing artifact");

    if (blockers.length > 0) {
      return base(
        state,
        "block_incomplete_embodiment",
        false,
        resolvedEvidence,
        blockers,
        "supply behavior-bearing executable and routing evidence for the next embodiment",
      );
    }

    return base(
      state,
      "advance_to_external_embodiment",
      true,
      [...resolvedEvidence, move.move_id, ...move.changed_files.filter(behaviorFile), ...move.executable_artifacts, ...move.routing_artifacts],
      [],
      "commit the new embodiment, then bind the next readback to the moved live head only",
    );
  }

  if (move.move_class === "fresh_status_readback") {
    if (move.status_head_sha !== state.live_head_sha) {
      return base(
        state,
        "block_stale_head_authority",
        false,
        resolvedEvidence,
        [`status head ${move.status_head_sha ?? "<none>"} is not live head ${state.live_head_sha}`],
        "read status only for the current live PR head after the repaired-head boundary is retired",
      );
    }

    return base(
      state,
      "advance_to_fresh_live_head_readback",
      true,
      [...resolvedEvidence, move.move_id, `status head ${state.live_head_sha}`],
      [],
      "classify the live-head status surface without reusing repaired-head authority",
    );
  }

  const blocker = move.blocker?.trim();
  if (!blocker) {
    return base(
      state,
      "block_missing_exact_blocker",
      false,
      resolvedEvidence,
      ["exact external blocker move has no blocker text"],
      "name the exact blocker or choose a valid embodiment/readback move",
    );
  }

  return base(
    state,
    "advance_to_exact_external_blocker",
    true,
    [...resolvedEvidence, move.move_id, blocker],
    [blocker],
    "remove the named blocker before any further progress claim",
  );
}
