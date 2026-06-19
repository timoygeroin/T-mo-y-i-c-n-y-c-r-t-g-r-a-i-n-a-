export type ReviewFeedbackDeltaKind = "approval" | "changes_requested" | "comment" | "dismissed" | "pending";

export type ReviewFeedbackDeltaNextAction =
  | "merge_gate"
  | "review_repair"
  | "review_triage"
  | "wait_for_review"
  | "exact_external_blocker"
  | "metadata_reread"
  | "duplicate_comment";

export type ReviewFeedbackDeltaAction =
  | "route_feedback_to_merge_gate"
  | "route_feedback_to_bounded_repair"
  | "route_feedback_to_triage"
  | "wait_for_review_feedback"
  | "emit_review_feedback_blocker"
  | "block_stale_feedback_head"
  | "block_branch_mismatch"
  | "block_reused_delta"
  | "block_vague_repair_feedback"
  | "block_non_progress_action";

export interface ReviewFeedbackDeltaSurface {
  feedback_id: string;
  reviewer: string;
  branch: string;
  head_sha: string;
  kind: ReviewFeedbackDeltaKind;
  body?: string;
  file_paths?: string[];
  resolved?: boolean;
}

export interface ReviewFeedbackRepairItem {
  feedback_id: string;
  reviewer: string;
  file_paths: string[];
  summary: string;
}

export interface ReviewFeedbackDeltaRouterInput {
  active_branch: string;
  live_head_sha: string;
  delta_id: string;
  spent_delta_ids: string[];
  required_approval_count: number;
  feedback_surfaces: ReviewFeedbackDeltaSurface[];
  requested_next_action: ReviewFeedbackDeltaNextAction;
  known_external_blocker?: string;
}

export interface ReviewFeedbackDeltaRouterVerdict {
  ok: boolean;
  action: ReviewFeedbackDeltaAction;
  delta_id: string | null;
  branch: string;
  head_sha: string;
  approvals: string[];
  repair_items: ReviewFeedbackRepairItem[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_ACTIONS = new Set<ReviewFeedbackDeltaNextAction>(["metadata_reread", "duplicate_comment"]);

function normalize(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function liveSurfaces(input: ReviewFeedbackDeltaRouterInput): ReviewFeedbackDeltaSurface[] {
  return input.feedback_surfaces.filter(
    (surface) => surface.branch === input.active_branch && surface.head_sha === input.live_head_sha,
  );
}

function base(input: ReviewFeedbackDeltaRouterInput): Pick<
  ReviewFeedbackDeltaRouterVerdict,
  "delta_id" | "branch" | "head_sha"
> {
  return {
    delta_id: input.delta_id.trim() || null,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
  };
}

function block(
  input: ReviewFeedbackDeltaRouterInput,
  action: Exclude<
    ReviewFeedbackDeltaAction,
    | "route_feedback_to_merge_gate"
    | "route_feedback_to_bounded_repair"
    | "route_feedback_to_triage"
    | "wait_for_review_feedback"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ReviewFeedbackDeltaRouterVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    approvals: [],
    repair_items: [],
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function repairItem(surface: ReviewFeedbackDeltaSurface): ReviewFeedbackRepairItem {
  return {
    feedback_id: surface.feedback_id,
    reviewer: surface.reviewer,
    file_paths: normalize(surface.file_paths ?? []),
    summary: surface.body?.trim() || `review changes requested by ${surface.reviewer}`,
  };
}

export function routeReviewFeedbackDelta(
  input: ReviewFeedbackDeltaRouterInput,
): ReviewFeedbackDeltaRouterVerdict {
  const deltaId = input.delta_id.trim();
  const evidence = [`delta ${deltaId || "<missing>"}`, `live head ${input.live_head_sha}`, `branch ${input.active_branch}`];

  if (!deltaId || input.spent_delta_ids.includes(deltaId)) {
    return block(
      input,
      "block_reused_delta",
      [deltaId ? `review feedback delta already spent: ${deltaId}` : "review feedback delta has no id"],
      "issue a fresh review feedback delta id before routing live-head feedback",
      evidence,
    );
  }

  const mismatchedBranch = input.feedback_surfaces.find((surface) => surface.branch !== input.active_branch);
  if (mismatchedBranch) {
    return block(
      input,
      "block_branch_mismatch",
      [`feedback ${mismatchedBranch.feedback_id} is on ${mismatchedBranch.branch}, not ${input.active_branch}`],
      "discard cross-branch review feedback before review repair or merge routing",
      [...evidence, mismatchedBranch.feedback_id],
    );
  }

  const staleFeedback = input.feedback_surfaces.find((surface) => surface.head_sha !== input.live_head_sha);
  if (staleFeedback) {
    return block(
      input,
      "block_stale_feedback_head",
      [`feedback ${staleFeedback.feedback_id} belongs to ${staleFeedback.head_sha}, not ${input.live_head_sha}`],
      "refresh review feedback from the live PR head before routing repair, triage, or merge",
      [...evidence, staleFeedback.feedback_id],
    );
  }

  if (NON_PROGRESS_ACTIONS.has(input.requested_next_action)) {
    return block(
      input,
      "block_non_progress_action",
      [`${input.requested_next_action} cannot consume review feedback as progress`],
      "route live-head review feedback to bounded repair, triage, merge gate, or an exact blocker",
      evidence,
    );
  }

  const exactBlocker = input.known_external_blocker?.trim();
  if (exactBlocker) {
    return block(
      input,
      "emit_review_feedback_blocker",
      [exactBlocker],
      "remove the named review-feedback blocker before merge or repair routing",
      evidence,
    );
  }

  const current = liveSurfaces(input).filter((surface) => !surface.resolved);
  const repairItems = current.filter((surface) => surface.kind === "changes_requested").map(repairItem);
  const vagueRepair = repairItems.find((item) => item.file_paths.length === 0);
  if (vagueRepair) {
    return block(
      input,
      "block_vague_repair_feedback",
      [`review feedback ${vagueRepair.feedback_id} requests changes without bounded file paths`],
      "obtain file-bound review feedback or emit the exact external blocker before repair routing",
      [...evidence, vagueRepair.feedback_id],
    );
  }

  if (repairItems.length > 0) {
    return {
      ...base(input),
      ok: false,
      action: "route_feedback_to_bounded_repair",
      approvals: normalize(current.filter((surface) => surface.kind === "approval").map((surface) => surface.reviewer)),
      repair_items: repairItems,
      decisive_evidence: [
        ...evidence,
        ...repairItems.flatMap((item) => [item.feedback_id, item.reviewer, ...item.file_paths]),
      ],
      blockers: repairItems.map((item) => `repair ${item.feedback_id} before merge gate`),
      next_route: "repair only the file-bound live-head review deltas, then request fresh status for the moved head",
    };
  }

  const actionableComments = current.filter((surface) => surface.kind === "comment" && (surface.file_paths ?? []).length > 0);
  if (actionableComments.length > 0) {
    return {
      ...base(input),
      ok: false,
      action: "route_feedback_to_triage",
      approvals: normalize(current.filter((surface) => surface.kind === "approval").map((surface) => surface.reviewer)),
      repair_items: actionableComments.map(repairItem),
      decisive_evidence: [...evidence, ...actionableComments.map((surface) => surface.feedback_id)],
      blockers: actionableComments.map((surface) => `triage review comment ${surface.feedback_id}`),
      next_route: "triage file-bound review comments before merge finalization or another embodiment increment",
    };
  }

  const approvals = normalize(current.filter((surface) => surface.kind === "approval").map((surface) => surface.reviewer));
  if (approvals.length >= Math.max(1, input.required_approval_count)) {
    return {
      ...base(input),
      ok: true,
      action: "route_feedback_to_merge_gate",
      approvals,
      repair_items: [],
      decisive_evidence: [...evidence, ...approvals.map((reviewer) => `approved by ${reviewer}`)],
      blockers: [],
      next_route: "enter merge gate only if live-head status and mergeability leases are still current",
    };
  }

  return {
    ...base(input),
    ok: false,
    action: "wait_for_review_feedback",
    approvals,
    repair_items: [],
    decisive_evidence: evidence,
    blockers: ["no live-head approval, bounded review repair, or actionable review comment has surfaced"],
    next_route: "wait for live-head review feedback or emit the exact external review blocker",
  };
}
