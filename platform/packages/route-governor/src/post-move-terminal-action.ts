export type PostMoveStatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "missing";

export type PostMoveReviewVerdict = "approved" | "changes_requested" | "pending" | "not_requested";

export type PostMoveTerminalAction =
  | "read_fresh_status"
  | "repair_current_head_failure"
  | "request_or_wait_for_review"
  | "compile_merge_execution"
  | "emit_exact_external_blocker"
  | "block_non_progress_surface";

export interface PostMoveStatusSurface {
  surface_id: string;
  head_sha: string;
  verdict: PostMoveStatusVerdict;
  decisive_successes: string[];
  blocking_failures: string[];
  pending_surfaces: string[];
  non_blocking_warnings: string[];
  failure_signature?: string;
}

export interface PostMoveReviewSurface {
  surface_id: string;
  head_sha: string;
  verdict: PostMoveReviewVerdict;
  approvals: string[];
  change_requests: string[];
  pending_reviewers: string[];
}

export interface PostMoveTerminalActionInput {
  active_branch: string;
  live_head_sha: string;
  last_status_readback_head_sha?: string;
  prompt_head_sha?: string;
  resolved_historical_heads: string[];
  draft: boolean;
  mergeable: boolean;
  required_approval_count: number;
  promoted_surface_ids: string[];
  spent_action_ids: string[];
  status_surface?: PostMoveStatusSurface;
  review_surface?: PostMoveReviewSurface;
  action_id: string;
  exact_external_blocker?: string;
}

export interface PostMoveTerminalActionVerdict {
  ok: boolean;
  action: PostMoveTerminalAction;
  action_id: string | null;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

const REQUIRED_MERGE_SURFACES = ["merge-finalization-command-public-surface", "merge-result-receipt-public-surface"];

function liveStatus(input: PostMoveTerminalActionInput): PostMoveStatusSurface | null {
  return input.status_surface?.head_sha === input.live_head_sha ? input.status_surface : null;
}

function liveReview(input: PostMoveTerminalActionInput): PostMoveReviewSurface | null {
  return input.review_surface?.head_sha === input.live_head_sha ? input.review_surface : null;
}

function hasPassingStatus(surface: PostMoveStatusSurface): boolean {
  return (
    (surface.verdict === "passing" || surface.verdict === "passing_with_warnings") &&
    surface.decisive_successes.length > 0 &&
    surface.blocking_failures.length === 0 &&
    surface.pending_surfaces.length === 0
  );
}

function missingMergeSurfaces(input: PostMoveTerminalActionInput): string[] {
  return REQUIRED_MERGE_SURFACES.filter((surface) => !input.promoted_surface_ids.includes(surface));
}

function base(input: PostMoveTerminalActionInput): Pick<PostMoveTerminalActionVerdict, "branch" | "head_sha"> {
  return { branch: input.active_branch, head_sha: input.live_head_sha };
}

function block(
  input: PostMoveTerminalActionInput,
  action: PostMoveTerminalAction,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
  warnings: string[] = [],
): PostMoveTerminalActionVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    action_id: input.action_id.trim() || null,
    decisive_evidence: evidence,
    blockers,
    warnings,
    next_route: nextRoute,
  };
}

function historyEvidence(input: PostMoveTerminalActionInput): string[] {
  return [
    ...input.resolved_historical_heads
      .filter((head) => head !== input.live_head_sha)
      .map((head) => `historical head ${head}`),
    ...(input.prompt_head_sha && input.prompt_head_sha !== input.live_head_sha
      ? [`prompt head ${input.prompt_head_sha} is not live head ${input.live_head_sha}`]
      : []),
  ];
}

export function compilePostMoveTerminalAction(
  input: PostMoveTerminalActionInput,
): PostMoveTerminalActionVerdict {
  const actionId = input.action_id.trim();
  if (!actionId) {
    return block(
      input,
      "block_non_progress_surface",
      ["post-move terminal action has no action id"],
      "compile each terminal action with a durable action id before release",
      historyEvidence(input),
    );
  }

  if (input.spent_action_ids.includes(actionId)) {
    return block(
      input,
      "block_non_progress_surface",
      [`post-move terminal action already spent: ${actionId}`],
      "select an unspent terminal action id before claiming progress",
      [actionId, ...historyEvidence(input)],
    );
  }

  const status = liveStatus(input);
  const review = liveReview(input);
  const headMovedSinceStatus = input.last_status_readback_head_sha !== input.live_head_sha;

  if (!status || headMovedSinceStatus) {
    return {
      ...base(input),
      ok: true,
      action: "read_fresh_status",
      action_id: actionId,
      decisive_evidence: [
        actionId,
        `live head ${input.live_head_sha}`,
        ...(input.last_status_readback_head_sha
          ? [`last status head ${input.last_status_readback_head_sha}`]
          : ["no prior status readback head"]),
        ...historyEvidence(input),
      ],
      blockers: [],
      warnings: [],
      next_route: "read only a direct status surface bound to the live PR head before repair, review, or merge routing",
    };
  }

  if (status.verdict === "failing") {
    if (!status.failure_signature?.trim()) {
      return block(
        input,
        "emit_exact_external_blocker",
        ["live-head failing status has no concrete failure signature"],
        "obtain the concrete live-head failure signature before writing a repair",
        [actionId, status.surface_id, ...status.blocking_failures],
        status.non_blocking_warnings,
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "repair_current_head_failure",
      action_id: actionId,
      decisive_evidence: [actionId, status.surface_id, status.failure_signature, ...status.blocking_failures],
      blockers: [],
      warnings: status.non_blocking_warnings,
      next_route: "repair only the concrete live-head failure, then require status readback for the moved head",
    };
  }

  if (status.verdict === "pending" || status.pending_surfaces.length > 0) {
    return block(
      input,
      "emit_exact_external_blocker",
      [...status.pending_surfaces, "live-head status is still pending"],
      "wait for the live-head status surface before repair, review, or merge routing",
      [actionId, status.surface_id],
      status.non_blocking_warnings,
    );
  }

  if (!hasPassingStatus(status)) {
    return block(
      input,
      "emit_exact_external_blocker",
      ["live-head status surface does not contain decisive passing evidence"],
      "read a decisive live-head passing status surface before advancing",
      [actionId, status.surface_id],
      status.non_blocking_warnings,
    );
  }

  if (review?.verdict === "changes_requested") {
    return {
      ...base(input),
      ok: true,
      action: "repair_current_head_failure",
      action_id: actionId,
      decisive_evidence: [
        actionId,
        status.surface_id,
        review.surface_id,
        ...review.change_requests.map((reviewer) => `changes requested by ${reviewer}`),
      ],
      blockers: [],
      warnings: status.non_blocking_warnings,
      next_route: "repair the live-head review request before merge routing",
    };
  }

  const approvals = review?.approvals ?? [];
  const requiredApprovals = Math.max(1, input.required_approval_count);
  if (approvals.length < requiredApprovals) {
    return {
      ...base(input),
      ok: true,
      action: "request_or_wait_for_review",
      action_id: actionId,
      decisive_evidence: [
        actionId,
        status.surface_id,
        `approvals ${approvals.length}/${requiredApprovals}`,
        ...(review ? [review.surface_id, ...review.pending_reviewers] : ["no live-head review surface"]),
      ],
      blockers: [],
      warnings: status.non_blocking_warnings,
      next_route: "request or wait for live-head review approval; do not treat metadata reread as approval",
    };
  }

  const missingSurfaces = missingMergeSurfaces(input);
  if (input.draft || !input.mergeable || missingSurfaces.length > 0) {
    return block(
      input,
      "emit_exact_external_blocker",
      [
        ...(input.draft ? ["PR is still draft"] : []),
        ...(!input.mergeable ? ["GitHub mergeability is not confirmed"] : []),
        ...missingSurfaces.map((surface) => `missing promoted finalization surface ${surface}`),
      ],
      "remove merge execution blockers before compiling the merge command",
      [actionId, status.surface_id, ...(review ? [review.surface_id] : [])],
      status.non_blocking_warnings,
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "compile_merge_execution",
    action_id: actionId,
    decisive_evidence: [
      actionId,
      status.surface_id,
      ...(review ? [review.surface_id] : []),
      ...status.decisive_successes,
      ...approvals.map((reviewer) => `approved by ${reviewer}`),
      ...REQUIRED_MERGE_SURFACES.map((surface) => `promoted surface ${surface}`),
    ],
    blockers: [],
    warnings: status.non_blocking_warnings,
    next_route: "compile and execute the merge command only while the PR head still matches this verdict",
  };
}
