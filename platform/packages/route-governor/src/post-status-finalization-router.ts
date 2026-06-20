export type PostStatusFinalizationStatusVerdict =
  | "passing"
  | "passing_with_warnings"
  | "pending"
  | "failing"
  | "no_status_surface";

export type PostStatusFinalizationRequestedAction =
  | "request_review"
  | "merge_command"
  | "external_platform_embodiment"
  | "exact_external_blocker"
  | "duplicate_status_summary"
  | "metadata_reread"
  | "warning_maintenance"
  | "reclose_resolved_blocker";

export type PostStatusFinalizationAction =
  | "admit_review_request"
  | "admit_merge_command"
  | "admit_next_embodiment"
  | "emit_exact_external_blocker"
  | "block_branch_mismatch"
  | "block_stale_status_head"
  | "block_unready_status"
  | "block_warning_only_detour"
  | "block_non_progress_action"
  | "block_missing_review_surface"
  | "block_missing_merge_surface"
  | "block_missing_embodiment_surface"
  | "block_missing_exact_blocker";

export interface PostStatusFinalizationStatusSurface {
  branch: string;
  head_sha: string;
  verdict: PostStatusFinalizationStatusVerdict;
  successful_surfaces: string[];
  warning_surfaces: string[];
  blocking_surfaces: string[];
  pending_surfaces: string[];
}

export interface PostStatusFinalizationCandidate {
  action_id: string;
  requested_action: PostStatusFinalizationRequestedAction;
  branch: string;
  base_head_sha: string;
  review_surface?: string;
  merge_surface?: string;
  changed_files: string[];
  behavior_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  blocker?: string;
}

export interface PostStatusFinalizationInput {
  active_branch: string;
  live_head_sha: string;
  repaired_historical_heads: string[];
  spent_action_ids: string[];
  status_surface: PostStatusFinalizationStatusSurface;
  candidate: PostStatusFinalizationCandidate;
}

export interface PostStatusFinalizationVerdict {
  ok: boolean;
  action: PostStatusFinalizationAction;
  branch: string;
  head_sha: string;
  action_id: string | null;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  retired_heads: string[];
  next_route: string;
}

const NON_PROGRESS_ACTIONS = new Set<PostStatusFinalizationRequestedAction>([
  "duplicate_status_summary",
  "metadata_reread",
  "warning_maintenance",
  "reclose_resolved_blocker",
]);

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function proofOnlyPath(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function statusReady(verdict: PostStatusFinalizationStatusVerdict): boolean {
  return verdict === "passing" || verdict === "passing_with_warnings";
}

function retiredHeads(input: PostStatusFinalizationInput): string[] {
  return input.repaired_historical_heads.filter((head) => head !== input.live_head_sha);
}

function base(input: PostStatusFinalizationInput): Pick<
  PostStatusFinalizationVerdict,
  "branch" | "head_sha" | "action_id" | "warnings" | "retired_heads"
> {
  return {
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    action_id: input.candidate.action_id.trim() || null,
    warnings: input.status_surface.warning_surfaces,
    retired_heads: retiredHeads(input),
  };
}

function block(
  input: PostStatusFinalizationInput,
  action: Exclude<
    PostStatusFinalizationAction,
    "admit_review_request" | "admit_merge_command" | "admit_next_embodiment" | "emit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): PostStatusFinalizationVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function embodimentBlockers(candidate: PostStatusFinalizationCandidate): string[] {
  const executableChanges = candidate.changed_files.filter(executablePlatformPath);
  const behaviorChanges = executableChanges.filter((path) => !proofOnlyPath(path));
  const blockers: string[] = [];

  if (!candidate.action_id.trim()) blockers.push("post-status finalization candidate has no action id");
  if (executableChanges.length === 0) blockers.push("post-status embodiment changes no executable platform file");
  if (executableChanges.length > 0 && behaviorChanges.length === 0) {
    blockers.push("post-status embodiment is proof-only and has no behavior-bearing file");
  }
  if (candidate.behavior_artifacts.length === 0) blockers.push("post-status embodiment has no behavior artifact");
  if (candidate.routing_artifacts.length === 0) blockers.push("post-status embodiment has no routing artifact");
  if (candidate.proof_artifacts.length === 0) blockers.push("post-status embodiment has no proof artifact");

  return blockers;
}

export function routePostStatusFinalization(input: PostStatusFinalizationInput): PostStatusFinalizationVerdict {
  const candidate = input.candidate;
  const status = input.status_surface;

  if (status.branch !== input.active_branch || candidate.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`post-status finalization must stay on active branch ${input.active_branch}`],
      "bind the status surface and candidate action to the active PR branch",
      [status.branch, candidate.branch],
    );
  }

  if (status.head_sha !== input.live_head_sha || candidate.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_status_head",
      [`status or candidate is not bound to live head ${input.live_head_sha}`],
      "read status and choose the next action only from the current live head",
      [`status head ${status.head_sha}`, `candidate base ${candidate.base_head_sha}`, ...retiredHeads(input)],
    );
  }

  if (!statusReady(status.verdict)) {
    return block(
      input,
      "block_unready_status",
      [`post-status finalization cannot proceed from ${status.verdict}`],
      "wait for passing current-head status or repair the listed blocking surface",
      [...status.blocking_surfaces, ...status.pending_surfaces],
    );
  }

  if (input.spent_action_ids.includes(candidate.action_id)) {
    return block(
      input,
      "block_non_progress_action",
      [`post-status finalization action already spent: ${candidate.action_id}`],
      "choose an unspent post-status action id before releasing the next step",
    );
  }

  if (NON_PROGRESS_ACTIONS.has(candidate.requested_action)) {
    const action =
      candidate.requested_action === "warning_maintenance" ? "block_warning_only_detour" : "block_non_progress_action";
    return block(
      input,
      action,
      [`post-status finalization cannot progress through ${candidate.requested_action}`],
      "choose review request, merge command, new executable embodiment, or one exact blocker",
      [candidate.requested_action, ...status.successful_surfaces],
    );
  }

  const statusEvidence = [
    `status head ${status.head_sha}`,
    `status verdict ${status.verdict}`,
    ...status.successful_surfaces,
    ...status.warning_surfaces,
  ];

  if (candidate.requested_action === "request_review") {
    if (!candidate.review_surface?.trim()) {
      return block(
        input,
        "block_missing_review_surface",
        ["review request action requires a named review surface"],
        "name the review surface before requesting review",
        statusEvidence,
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_review_request",
      decisive_evidence: [...statusEvidence, candidate.review_surface],
      blockers: [],
      next_route: "request review on the live PR head without repeating status summary as progress",
    };
  }

  if (candidate.requested_action === "merge_command") {
    if (!candidate.merge_surface?.trim()) {
      return block(
        input,
        "block_missing_merge_surface",
        ["merge command requires a named merge surface"],
        "name the merge surface before issuing a merge command",
        statusEvidence,
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_merge_command",
      decisive_evidence: [...statusEvidence, candidate.merge_surface],
      blockers: [],
      next_route: "issue the merge command only with expected-head protection",
    };
  }

  if (candidate.requested_action === "exact_external_blocker") {
    const blocker = candidate.blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_missing_exact_blocker",
        ["post-status exact blocker candidate has no blocker text"],
        "name one exact external blocker or choose review, merge, or embodiment",
        statusEvidence,
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_exact_external_blocker",
      decisive_evidence: [...statusEvidence, blocker],
      blockers: [blocker],
      next_route: "remove the named blocker before another post-status finalization action",
    };
  }

  const embodimentFailures = embodimentBlockers(candidate);
  if (embodimentFailures.length > 0) {
    return block(
      input,
      "block_missing_embodiment_surface",
      embodimentFailures,
      "attach behavior, routing, and proof artifacts before claiming another executable embodiment",
      statusEvidence,
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_next_embodiment",
    decisive_evidence: [
      ...statusEvidence,
      ...candidate.changed_files,
      ...candidate.behavior_artifacts,
      ...candidate.routing_artifacts,
      ...candidate.proof_artifacts,
    ],
    blockers: [],
    next_route: "commit the named executable embodiment, then reopen post-write status escrow for the moved head",
  };
}
