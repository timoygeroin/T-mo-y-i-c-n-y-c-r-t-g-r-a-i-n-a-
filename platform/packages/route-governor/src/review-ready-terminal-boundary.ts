export type ReviewReadyTerminalStatus = "passing" | "passing_with_warnings" | "pending" | "failing" | "no_status_surface";

export type ReviewReadyTerminalFeedbackKind = "approval" | "changes_requested" | "comment" | "pending";

export type ReviewReadyTerminalNextAction =
  | "merge_gate"
  | "review_repair"
  | "wait_for_review"
  | "external_platform_embodiment"
  | "exact_external_blocker"
  | "metadata_reread"
  | "duplicate_status_summary"
  | "duplicate_comment"
  | "reclose_resolved_blocker";

export type ReviewReadyTerminalAction =
  | "admit_merge_gate"
  | "route_review_changes_to_repair"
  | "wait_for_external_review"
  | "route_to_external_embodiment"
  | "emit_exact_external_blocker"
  | "block_non_progress_action"
  | "block_draft_pr"
  | "block_stale_status_surface"
  | "block_unresolved_status_surface"
  | "block_missing_mergeability"
  | "block_missing_exact_blocker";

export interface ReviewReadyTerminalFeedbackSurface {
  feedback_id: string;
  reviewer: string;
  branch: string;
  head_sha: string;
  kind: ReviewReadyTerminalFeedbackKind;
  body?: string;
  file_paths?: string[];
  resolved?: boolean;
}

export interface ReviewReadyTerminalStatusSurface {
  surface_id: string;
  branch: string;
  head_sha: string;
  verdict: ReviewReadyTerminalStatus;
  decisive_successes: string[];
  blockers: string[];
  warnings: string[];
}

export interface ReviewReadyTerminalBoundaryInput {
  active_branch: string;
  live_head_sha: string;
  pr_is_draft: boolean;
  mergeable: boolean;
  required_approval_count: number;
  requested_next_action: ReviewReadyTerminalNextAction;
  status_surface: ReviewReadyTerminalStatusSurface;
  feedback_surfaces: ReviewReadyTerminalFeedbackSurface[];
  exact_blocker?: string;
}

export interface ReviewReadyTerminalBoundaryVerdict {
  ok: boolean;
  action: ReviewReadyTerminalAction;
  branch: string;
  head_sha: string;
  approvals: string[];
  repair_feedback_ids: string[];
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

const NON_PROGRESS_ACTIONS = new Set<ReviewReadyTerminalNextAction>([
  "metadata_reread",
  "duplicate_status_summary",
  "duplicate_comment",
  "reclose_resolved_blocker",
]);

function normalized(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function base(input: ReviewReadyTerminalBoundaryInput): Pick<
  ReviewReadyTerminalBoundaryVerdict,
  "branch" | "head_sha" | "warnings"
> {
  return {
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    warnings: input.status_surface.warnings,
  };
}

function block(
  input: ReviewReadyTerminalBoundaryInput,
  action: Exclude<
    ReviewReadyTerminalAction,
    | "admit_merge_gate"
    | "route_review_changes_to_repair"
    | "wait_for_external_review"
    | "route_to_external_embodiment"
    | "emit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ReviewReadyTerminalBoundaryVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    approvals: [],
    repair_feedback_ids: [],
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function statusReady(surface: ReviewReadyTerminalStatusSurface): boolean {
  return (
    (surface.verdict === "passing" || surface.verdict === "passing_with_warnings") &&
    surface.decisive_successes.length > 0 &&
    surface.blockers.length === 0
  );
}

function liveFeedback(input: ReviewReadyTerminalBoundaryInput): ReviewReadyTerminalFeedbackSurface[] {
  return input.feedback_surfaces.filter(
    (surface) =>
      surface.branch === input.active_branch && surface.head_sha === input.live_head_sha && surface.resolved !== true,
  );
}

export function routeReviewReadyTerminalBoundary(
  input: ReviewReadyTerminalBoundaryInput,
): ReviewReadyTerminalBoundaryVerdict {
  const surface = input.status_surface;
  const evidence = [`live head ${input.live_head_sha}`, `status surface ${surface.surface_id}`];

  if (input.pr_is_draft) {
    return block(
      input,
      "block_draft_pr",
      ["review-ready terminal boundary requires a non-draft PR"],
      "mark the PR ready for review before consuming review-ready terminal routing",
      evidence,
    );
  }

  if (NON_PROGRESS_ACTIONS.has(input.requested_next_action)) {
    return block(
      input,
      "block_non_progress_action",
      [`${input.requested_next_action} cannot advance a review-ready PR`],
      "route to review feedback, merge gate, external embodiment, wait-for-review, or an exact blocker",
      evidence,
    );
  }

  if (surface.branch !== input.active_branch || surface.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_status_surface",
      [`status surface ${surface.surface_id} is not bound to ${input.active_branch}@${input.live_head_sha}`],
      "refresh the status surface for the live PR head before terminal review routing",
      evidence,
    );
  }

  if (!statusReady(surface)) {
    return block(
      input,
      "block_unresolved_status_surface",
      [
        ...surface.blockers,
        ...(surface.decisive_successes.length === 0 ? ["status surface has no decisive success evidence"] : []),
        ...(surface.verdict === "pending" ? ["status surface is pending"] : []),
        ...(surface.verdict === "failing" ? ["status surface is failing"] : []),
        ...(surface.verdict === "no_status_surface" ? ["status surface is missing"] : []),
      ],
      "resolve live-head status before review-ready terminal routing",
      evidence,
    );
  }

  if (input.requested_next_action === "exact_external_blocker") {
    const blocker = input.exact_blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_missing_exact_blocker",
        ["exact external blocker action has no blocker text"],
        "name one exact external blocker or choose a terminal review route",
        evidence,
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_exact_external_blocker",
      approvals: [],
      repair_feedback_ids: [],
      decisive_evidence: [...evidence, blocker],
      blockers: [blocker],
      next_route: "remove the named external blocker before terminal review routing resumes",
    };
  }

  const currentFeedback = liveFeedback(input);
  const repairs = currentFeedback.filter((surfaceItem) => surfaceItem.kind === "changes_requested");
  if (repairs.length > 0) {
    return {
      ...base(input),
      ok: false,
      action: "route_review_changes_to_repair",
      approvals: normalized(currentFeedback.filter((item) => item.kind === "approval").map((item) => item.reviewer)),
      repair_feedback_ids: repairs.map((item) => item.feedback_id),
      decisive_evidence: [
        ...evidence,
        ...repairs.flatMap((item) => [item.feedback_id, item.reviewer, ...(item.file_paths ?? [])]),
      ],
      blockers: repairs.map((item) => `repair review feedback ${item.feedback_id}`),
      next_route: "repair only live-head review feedback, then request fresh status for the moved head",
    };
  }

  const approvals = normalized(currentFeedback.filter((surfaceItem) => surfaceItem.kind === "approval").map((item) => item.reviewer));
  if (input.requested_next_action === "merge_gate") {
    if (approvals.length < Math.max(1, input.required_approval_count)) {
      return {
        ...base(input),
        ok: false,
        action: "wait_for_external_review",
        approvals,
        repair_feedback_ids: [],
        decisive_evidence: evidence,
        blockers: [`merge gate requires ${Math.max(1, input.required_approval_count)} approval(s); got ${approvals.length}`],
        next_route: "wait for live-head review approval before merge gate",
      };
    }

    if (!input.mergeable) {
      return block(
        input,
        "block_missing_mergeability",
        ["GitHub mergeability is not confirmed for the live head"],
        "refresh mergeability before compiling the merge gate",
        [...evidence, ...approvals.map((reviewer) => `approved by ${reviewer}`)],
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_merge_gate",
      approvals,
      repair_feedback_ids: [],
      decisive_evidence: [...evidence, ...surface.decisive_successes, ...approvals.map((reviewer) => `approved by ${reviewer}`)],
      blockers: [],
      next_route: "compile merge command only while status, review, and mergeability remain bound to this head",
    };
  }

  if (input.requested_next_action === "external_platform_embodiment") {
    return {
      ...base(input),
      ok: true,
      action: "route_to_external_embodiment",
      approvals,
      repair_feedback_ids: [],
      decisive_evidence: [...evidence, ...surface.decisive_successes],
      blockers: [],
      next_route: "continue with a non-repeated executable embodiment only while review feedback has not supplied a stronger terminal route",
    };
  }

  return {
    ...base(input),
    ok: false,
    action: "wait_for_external_review",
    approvals,
    repair_feedback_ids: [],
    decisive_evidence: [...evidence, ...surface.decisive_successes],
    blockers: ["PR is ready for review, but no live-head approval, review repair, merge gate, or exact blocker has surfaced"],
    next_route: "wait for external review feedback instead of repeating status summaries, labels, comments, or blocker closure",
  };
}
