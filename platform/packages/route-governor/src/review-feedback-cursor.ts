export type ReviewFeedbackCursorKind = "approval" | "changes_requested" | "comment" | "dismissed" | "pending";

export type ReviewFeedbackCursorRequestedAction =
  | "review_feedback_delta"
  | "wait_for_review"
  | "exact_external_blocker"
  | "metadata_reread"
  | "duplicate_comment"
  | "duplicate_status_summary";

export type ReviewFeedbackCursorAction =
  | "admit_new_live_head_feedback"
  | "wait_for_new_review_feedback"
  | "emit_exact_external_blocker"
  | "block_branch_mismatch"
  | "block_stale_feedback_head"
  | "block_reused_cursor"
  | "block_seen_feedback_only"
  | "block_non_progress_action"
  | "block_missing_exact_blocker";

export interface ReviewFeedbackCursorSurface {
  feedback_id: string;
  branch: string;
  head_sha: string;
  kind: ReviewFeedbackCursorKind;
  reviewer: string;
  resolved?: boolean;
  file_paths?: string[];
}

export interface ReviewFeedbackCursorInput {
  active_branch: string;
  live_head_sha: string;
  cursor_id: string;
  spent_cursor_ids: string[];
  seen_feedback_ids: string[];
  feedback_surfaces: ReviewFeedbackCursorSurface[];
  requested_next_action: ReviewFeedbackCursorRequestedAction;
  exact_blocker?: string;
}

export interface ReviewFeedbackCursorVerdict {
  ok: boolean;
  action: ReviewFeedbackCursorAction;
  cursor_id: string | null;
  branch: string;
  head_sha: string;
  new_feedback_ids: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_ACTIONS = new Set<ReviewFeedbackCursorRequestedAction>([
  "metadata_reread",
  "duplicate_comment",
  "duplicate_status_summary",
]);

function normalize(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function base(input: ReviewFeedbackCursorInput): Pick<
  ReviewFeedbackCursorVerdict,
  "cursor_id" | "branch" | "head_sha"
> {
  return {
    cursor_id: input.cursor_id.trim() || null,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
  };
}

function block(
  input: ReviewFeedbackCursorInput,
  action: Exclude<
    ReviewFeedbackCursorAction,
    "admit_new_live_head_feedback" | "wait_for_new_review_feedback" | "emit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ReviewFeedbackCursorVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    new_feedback_ids: [],
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function liveOpenFeedback(input: ReviewFeedbackCursorInput): ReviewFeedbackCursorSurface[] {
  return input.feedback_surfaces.filter(
    (surface) =>
      surface.branch === input.active_branch && surface.head_sha === input.live_head_sha && surface.resolved !== true,
  );
}

export function routeReviewFeedbackCursor(input: ReviewFeedbackCursorInput): ReviewFeedbackCursorVerdict {
  const cursorId = input.cursor_id.trim();
  const evidence = [`cursor ${cursorId || "<missing>"}`, `branch ${input.active_branch}`, `live head ${input.live_head_sha}`];

  if (!cursorId || input.spent_cursor_ids.includes(cursorId)) {
    return block(
      input,
      "block_reused_cursor",
      [cursorId ? `review feedback cursor already spent: ${cursorId}` : "review feedback cursor has no id"],
      "issue a fresh review feedback cursor before consuming review surfaces",
      evidence,
    );
  }

  const wrongBranch = input.feedback_surfaces.find((surface) => surface.branch !== input.active_branch);
  if (wrongBranch) {
    return block(
      input,
      "block_branch_mismatch",
      [`review feedback ${wrongBranch.feedback_id} is on ${wrongBranch.branch}, not ${input.active_branch}`],
      "discard cross-branch review feedback before cursor admission",
      [...evidence, wrongBranch.feedback_id],
    );
  }

  const staleHead = input.feedback_surfaces.find((surface) => surface.head_sha !== input.live_head_sha);
  if (staleHead) {
    return block(
      input,
      "block_stale_feedback_head",
      [`review feedback ${staleHead.feedback_id} belongs to ${staleHead.head_sha}, not ${input.live_head_sha}`],
      "refresh review feedback for the live PR head before routing repair, triage, or merge",
      [...evidence, staleHead.feedback_id],
    );
  }

  if (NON_PROGRESS_ACTIONS.has(input.requested_next_action)) {
    return block(
      input,
      "block_non_progress_action",
      [`${input.requested_next_action} cannot consume review feedback cursor state as progress`],
      "consume only unseen live-head review feedback, wait without progress, or emit one exact external blocker",
      [...evidence, input.requested_next_action],
    );
  }

  if (input.requested_next_action === "exact_external_blocker") {
    const blocker = input.exact_blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_missing_exact_blocker",
        ["review feedback cursor exact blocker has no blocker text"],
        "name the exact external review-feedback blocker or wait without counting progress",
        evidence,
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_exact_external_blocker",
      new_feedback_ids: [],
      decisive_evidence: [...evidence, blocker],
      blockers: [blocker],
      next_route: "remove the named blocker before consuming review feedback cursor state again",
    };
  }

  const seen = new Set(normalize(input.seen_feedback_ids));
  const liveOpen = liveOpenFeedback(input);
  const unseen = liveOpen.filter((surface) => !seen.has(surface.feedback_id));
  const unseenIds = normalize(unseen.map((surface) => surface.feedback_id));

  if (unseenIds.length > 0) {
    return {
      ...base(input),
      ok: true,
      action: "admit_new_live_head_feedback",
      new_feedback_ids: unseenIds,
      decisive_evidence: [
        ...evidence,
        ...unseen.flatMap((surface) => [
          surface.feedback_id,
          surface.kind,
          surface.reviewer,
          ...normalize(surface.file_paths ?? []),
        ]),
      ],
      blockers: [],
      next_route: "route only these unseen live-head feedback ids through review-feedback-delta-router, then record them as seen",
    };
  }

  if (liveOpen.length > 0) {
    return block(
      input,
      "block_seen_feedback_only",
      liveOpen.map((surface) => `review feedback already consumed: ${surface.feedback_id}`),
      "do not count an already-seen review surface as progress; wait for new feedback or emit the exact external blocker",
      [...evidence, ...liveOpen.map((surface) => surface.feedback_id)],
    );
  }

  return {
    ...base(input),
    ok: false,
    action: "wait_for_new_review_feedback",
    new_feedback_ids: [],
    decisive_evidence: evidence,
    blockers: ["no live-head review feedback has surfaced beyond the cursor"],
    next_route: "wait for new live-head review feedback; do not replace it with metadata reread, duplicate comment, or local memory guard",
  };
}
