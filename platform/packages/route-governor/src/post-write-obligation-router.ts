export type PostWriteStatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "no_status_surface";

export type PostWriteRequestedMove =
  | "read_moved_head_status"
  | "repair_current_head_failure"
  | "continue_external_embodiment"
  | "publish_status_summary"
  | "publish_comment"
  | "apply_label"
  | "local_memory_guard"
  | "replay_resolved_blocker";

export type PostWriteObligationAction =
  | "require_moved_head_status"
  | "require_current_head_repair"
  | "wait_for_current_head_checks"
  | "admit_next_embodiment"
  | "block_non_progress_move"
  | "block_stale_or_unbound_status"
  | "block_unsettled_write";

export interface PostWriteStatusSurface {
  head_sha: string;
  verdict: PostWriteStatusVerdict;
  decisive_successes: string[];
  blocking_failures: string[];
  pending_surfaces: string[];
  non_blocking_warnings: string[];
}

export interface PostWriteObligationInput {
  active_branch: string;
  write_branch: string;
  pre_write_head_sha: string;
  post_write_head_sha: string;
  write_committed: boolean;
  requested_move: PostWriteRequestedMove;
  status_surface?: PostWriteStatusSurface;
  repeated_move_classes: PostWriteRequestedMove[];
  candidate_changed_files: string[];
  candidate_executable_artifacts: string[];
  candidate_routing_artifacts: string[];
}

export interface PostWriteObligationVerdict {
  ok: boolean;
  action: PostWriteObligationAction;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

const NON_PROGRESS_MOVES = new Set<PostWriteRequestedMove>([
  "publish_status_summary",
  "publish_comment",
  "apply_label",
  "local_memory_guard",
  "replay_resolved_blocker",
]);

function executablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function base(input: PostWriteObligationInput): Pick<PostWriteObligationVerdict, "branch" | "head_sha"> {
  return {
    branch: input.write_branch,
    head_sha: input.post_write_head_sha,
  };
}

function block(
  input: PostWriteObligationInput,
  action: Exclude<PostWriteObligationAction, "admit_next_embodiment">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
  warnings: string[] = [],
): PostWriteObligationVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    warnings,
    next_route: nextRoute,
  };
}

function embodimentBlockers(input: PostWriteObligationInput): string[] {
  const blockers: string[] = [];

  if (!input.candidate_changed_files.some(executablePlatformPath)) {
    blockers.push("next embodiment changes no executable platform file");
  }
  if (input.candidate_executable_artifacts.length === 0) {
    blockers.push("next embodiment has no executable artifact evidence");
  }
  if (input.candidate_routing_artifacts.length === 0) {
    blockers.push("next embodiment has no future-routing artifact evidence");
  }

  return blockers;
}

export function routePostWriteObligation(input: PostWriteObligationInput): PostWriteObligationVerdict {
  if (input.write_branch !== input.active_branch) {
    return block(
      input,
      "block_unsettled_write",
      [`write branch ${input.write_branch} does not match active branch ${input.active_branch}`],
      "bind the post-write obligation to the active PR branch before choosing the next move",
    );
  }

  if (!input.write_committed) {
    return block(
      input,
      "block_unsettled_write",
      ["post-write obligation cannot advance before the external write is committed"],
      "complete the branch write before routing the next obligation",
    );
  }

  if (input.pre_write_head_sha === input.post_write_head_sha) {
    return block(
      input,
      "block_unsettled_write",
      [`post-write head did not move from ${input.pre_write_head_sha}`],
      "require a moved branch head before using post-write routing",
    );
  }

  if (NON_PROGRESS_MOVES.has(input.requested_move) || input.repeated_move_classes.includes(input.requested_move)) {
    return block(
      input,
      "block_non_progress_move",
      [`post-write requested move is non-progress or repeated: ${input.requested_move}`],
      "choose moved-head status readback, concrete live-head repair, or a new executable embodiment only after status is settled",
      [input.requested_move],
    );
  }

  if (!input.status_surface) {
    return block(
      input,
      "require_moved_head_status",
      [`missing status surface for moved head ${input.post_write_head_sha}`],
      "read the moved PR head status before summaries, labels, comments, or another embodiment",
      [`moved head ${input.post_write_head_sha}`],
    );
  }

  if (input.status_surface.head_sha !== input.post_write_head_sha) {
    return block(
      input,
      "block_stale_or_unbound_status",
      [`status surface belongs to ${input.status_surface.head_sha}, not moved head ${input.post_write_head_sha}`],
      "discard stale status and read the moved PR head",
    );
  }

  if (input.status_surface.verdict === "no_status_surface") {
    return block(
      input,
      "require_moved_head_status",
      [`no status surface returned for moved head ${input.post_write_head_sha}`],
      "obtain a Checks, Actions, or workflow surface for the moved PR head",
      [],
      input.status_surface.non_blocking_warnings,
    );
  }

  if (input.status_surface.verdict === "pending") {
    return block(
      input,
      "wait_for_current_head_checks",
      input.status_surface.pending_surfaces.length > 0
        ? input.status_surface.pending_surfaces
        : [`moved-head checks are pending for ${input.post_write_head_sha}`],
      "wait for the moved-head checks to settle before repair or continuation",
      input.status_surface.pending_surfaces,
      input.status_surface.non_blocking_warnings,
    );
  }

  if (input.status_surface.verdict === "failing") {
    return block(
      input,
      "require_current_head_repair",
      input.status_surface.blocking_failures.length > 0
        ? input.status_surface.blocking_failures
        : [`moved-head checks are failing for ${input.post_write_head_sha}`],
      "repair the concrete moved-head failure before any further embodiment",
      input.status_surface.blocking_failures,
      input.status_surface.non_blocking_warnings,
    );
  }

  if (input.requested_move === "read_moved_head_status") {
    return block(
      input,
      "block_non_progress_move",
      [`status for moved head ${input.post_write_head_sha} is already bound and classified`],
      "do not reread status as progress; choose a new executable embodiment",
      input.status_surface.decisive_successes,
      input.status_surface.non_blocking_warnings,
    );
  }

  if (input.requested_move === "repair_current_head_failure") {
    return block(
      input,
      "block_non_progress_move",
      [`no blocking failure remains on moved head ${input.post_write_head_sha}`],
      "do not invent repair work after passing status; choose a new executable embodiment",
      input.status_surface.decisive_successes,
      input.status_surface.non_blocking_warnings,
    );
  }

  const blockers = embodimentBlockers(input);
  if (blockers.length > 0) {
    return block(
      input,
      "block_non_progress_move",
      blockers,
      "supply executable files, executable artifact evidence, and routing artifact evidence for the next embodiment",
      input.status_surface.decisive_successes,
      input.status_surface.non_blocking_warnings,
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_next_embodiment",
    decisive_evidence: [
      `status ${input.status_surface.verdict} for ${input.post_write_head_sha}`,
      ...input.status_surface.decisive_successes,
      ...input.candidate_changed_files.filter(executablePlatformPath),
      ...input.candidate_executable_artifacts,
      ...input.candidate_routing_artifacts,
    ],
    blockers: [],
    warnings: input.status_surface.non_blocking_warnings,
    next_route: "commit the next executable embodiment and restart the post-write obligation on the new moved head",
  };
}
