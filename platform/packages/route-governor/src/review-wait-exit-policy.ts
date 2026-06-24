export type ReviewWaitExitStatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "unknown";

export type ReviewWaitExitFeedbackKind = "none" | "pending" | "approved" | "changes_requested" | "commented";

export type ReviewWaitExitAction =
  | "request_final_review"
  | "route_to_review_repair"
  | "hold_review_wait"
  | "read_moved_head_status"
  | "emit_exact_external_blocker"
  | "block_wrong_branch"
  | "block_wrong_head"
  | "block_pr_not_ready"
  | "block_status_not_clear"
  | "block_reused_exit"
  | "block_missing_final_review_surface"
  | "block_missing_exact_blocker";

export interface ReviewWaitExitSurface {
  exit_id: string;
  branch: string;
  head_sha: string;
  pr_open: boolean;
  draft: boolean;
  mergeable: boolean | null;
  status_verdict: ReviewWaitExitStatusVerdict;
  feedback_kind: ReviewWaitExitFeedbackKind;
  feedback_ids: string[];
  final_review_surface_ids: string[];
  exact_blocker?: string;
}

export interface ReviewWaitExitPolicyInput {
  active_branch: string;
  live_head_sha: string;
  last_status_readback_head_sha: string;
  spent_exit_ids: string[];
  surface: ReviewWaitExitSurface;
}

export interface ReviewWaitExitPolicyVerdict {
  ok: boolean;
  action: ReviewWaitExitAction;
  exit_id: string | null;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

const REQUIRED_FINAL_REVIEW_SURFACES = [
  "final-review-authority-bundle",
  "review-request-command",
  "review-request-result-receipt",
];

function base(input: ReviewWaitExitPolicyInput): Pick<ReviewWaitExitPolicyVerdict, "exit_id" | "branch" | "head_sha"> {
  return {
    exit_id: input.surface.exit_id.trim() || null,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
  };
}

function evidence(input: ReviewWaitExitPolicyInput): string[] {
  return [
    `exit ${input.surface.exit_id.trim() || "<missing>"}`,
    `live head ${input.live_head_sha}`,
    `status ${input.surface.status_verdict}`,
    `feedback ${input.surface.feedback_kind}`,
    ...input.surface.feedback_ids.map((id) => `feedback ${id}`),
    ...input.surface.final_review_surface_ids.map((id) => `surface ${id}`),
  ];
}

function block(
  input: ReviewWaitExitPolicyInput,
  action: Exclude<
    ReviewWaitExitAction,
    "request_final_review" | "route_to_review_repair" | "hold_review_wait" | "read_moved_head_status" | "emit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
): ReviewWaitExitPolicyVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence(input),
    blockers,
    warnings: [],
    next_route: nextRoute,
  };
}

function clearStatus(status: ReviewWaitExitStatusVerdict): boolean {
  return status === "passing" || status === "passing_with_warnings";
}

function missingFinalReviewSurfaces(surfaceIds: string[]): string[] {
  return REQUIRED_FINAL_REVIEW_SURFACES.filter((surfaceId) => !surfaceIds.includes(surfaceId));
}

export function routeReviewWaitExitPolicy(input: ReviewWaitExitPolicyInput): ReviewWaitExitPolicyVerdict {
  const exitId = input.surface.exit_id.trim();

  if (!exitId || input.spent_exit_ids.includes(exitId)) {
    return block(
      input,
      "block_reused_exit",
      [exitId ? `review-wait exit already spent: ${exitId}` : "review-wait exit has no id"],
      "capture a fresh live-head review-wait exit before changing finalization state",
    );
  }

  if (input.surface.branch !== input.active_branch) {
    return block(
      input,
      "block_wrong_branch",
      [`review-wait exit branch ${input.surface.branch} is not active branch ${input.active_branch}`],
      "discard cross-branch review-wait exits before finalization routing",
    );
  }

  if (input.surface.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_wrong_head",
      [`review-wait exit head ${input.surface.head_sha} is not live head ${input.live_head_sha}`],
      "rebuild review-wait exit routing from the live PR head",
    );
  }

  if (!input.surface.pr_open || input.surface.draft || input.surface.mergeable !== true) {
    return block(
      input,
      "block_pr_not_ready",
      [
        `pr_open=${input.surface.pr_open}`,
        `draft=${input.surface.draft}`,
        `mergeable=${String(input.surface.mergeable)}`,
      ],
      "restore an open non-draft mergeable PR before leaving review wait",
    );
  }

  const headMoved = input.last_status_readback_head_sha !== input.live_head_sha;
  if (headMoved && input.surface.status_verdict === "unknown") {
    return {
      ...base(input),
      ok: false,
      action: "read_moved_head_status",
      decisive_evidence: [
        ...evidence(input),
        `head moved from ${input.last_status_readback_head_sha} to ${input.live_head_sha}`,
      ],
      blockers: [`fresh status/readback required for moved head ${input.live_head_sha}`],
      warnings: [],
      next_route: "obtain live-head status before exiting review wait",
    };
  }

  if (!clearStatus(input.surface.status_verdict)) {
    return block(
      input,
      "block_status_not_clear",
      [`status verdict ${input.surface.status_verdict} cannot exit review wait`],
      "repair or wait for live-head status before final-review routing",
    );
  }

  if (input.surface.feedback_kind === "changes_requested") {
    if (input.surface.feedback_ids.length === 0) {
      return block(
        input,
        "block_missing_exact_blocker",
        ["changes-requested exit has no review feedback id"],
        "bind the repair route to concrete review feedback before leaving review wait",
      );
    }

    return {
      ...base(input),
      ok: false,
      action: "route_to_review_repair",
      decisive_evidence: evidence(input),
      blockers: input.surface.feedback_ids.map((id) => `review repair required for ${id}`),
      warnings: input.surface.status_verdict === "passing_with_warnings" ? ["status warnings do not override changes-requested feedback"] : [],
      next_route: "commit only a review-bound repair, then require status readback for the moved head",
    };
  }

  if (input.surface.feedback_kind === "pending" || input.surface.feedback_kind === "commented") {
    return {
      ...base(input),
      ok: false,
      action: "hold_review_wait",
      decisive_evidence: evidence(input),
      blockers: [`review feedback state ${input.surface.feedback_kind} has not authorized final-review exit`],
      warnings: [],
      next_route: "wait for approval, changes-requested feedback, or an exact external blocker",
    };
  }

  const blocker = input.surface.exact_blocker?.trim();
  if (blocker) {
    return {
      ...base(input),
      ok: true,
      action: "emit_exact_external_blocker",
      decisive_evidence: [...evidence(input), blocker],
      blockers: [blocker],
      warnings: [],
      next_route: "remove the exact blocker before attempting final-review exit again",
    };
  }

  const missing = missingFinalReviewSurfaces(input.surface.final_review_surface_ids);
  if (missing.length > 0) {
    return block(
      input,
      "block_missing_final_review_surface",
      missing.map((surfaceId) => `missing final-review surface ${surfaceId}`),
      "promote final-review authority, request-command, and result-receipt surfaces before requesting final review",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "request_final_review",
    decisive_evidence: evidence(input),
    blockers: [],
    warnings: input.surface.status_verdict === "passing_with_warnings" ? ["warning-only status is allowed for final-review request"] : [],
    next_route: "request final review once, then route the external result through final-review outcome handling",
  };
}
