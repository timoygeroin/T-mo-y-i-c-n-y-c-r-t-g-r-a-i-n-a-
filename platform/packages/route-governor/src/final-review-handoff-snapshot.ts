export type FinalReviewSnapshotStatusVerdict = "success" | "warning_only" | "pending" | "failure";
export type FinalReviewSnapshotReviewVerdict = "approved" | "changes_requested" | "commented" | "none";
export type FinalReviewSnapshotBlockerVerdict = "retired" | "active" | "unknown";
export type FinalReviewSnapshotRequestedAction =
  | "request_final_review"
  | "merge_finalization"
  | "fresh_status_readback"
  | "duplicate_comment"
  | "metadata_reread";

export type FinalReviewHandoffAction =
  | "admit_final_review_handoff"
  | "block_snapshot_head_mismatch"
  | "block_branch_mismatch"
  | "block_reused_snapshot"
  | "block_status_not_successful"
  | "block_active_blocker"
  | "block_review_repair_needed"
  | "block_non_progress_action";

export interface FinalReviewSnapshotSurface {
  surface_id: string;
  branch: string;
  head_sha: string;
  evidence: string[];
}

export interface FinalReviewStatusSnapshot extends FinalReviewSnapshotSurface {
  verdict: FinalReviewSnapshotStatusVerdict;
  warnings: string[];
}

export interface FinalReviewMergeabilitySnapshot extends FinalReviewSnapshotSurface {
  mergeable: boolean | null;
}

export interface FinalReviewBlockerSnapshot extends FinalReviewSnapshotSurface {
  verdict: FinalReviewSnapshotBlockerVerdict;
  blocker_ids: string[];
}

export interface FinalReviewFeedbackSnapshot extends FinalReviewSnapshotSurface {
  verdict: FinalReviewSnapshotReviewVerdict;
  reviewers: string[];
  repair_items: string[];
}

export interface FinalReviewHandoffSnapshotInput {
  active_branch: string;
  live_head_sha: string;
  snapshot_id: string;
  spent_snapshot_ids: string[];
  requested_action: FinalReviewSnapshotRequestedAction;
  status: FinalReviewStatusSnapshot;
  mergeability: FinalReviewMergeabilitySnapshot;
  blockers: FinalReviewBlockerSnapshot;
  feedback: FinalReviewFeedbackSnapshot;
}

export interface FinalReviewHandoffSnapshotVerdict {
  ok: boolean;
  action: FinalReviewHandoffAction;
  snapshot_id: string | null;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  warnings: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_ACTIONS = new Set<FinalReviewSnapshotRequestedAction>(["duplicate_comment", "metadata_reread"]);
const HANDOFF_ACTIONS = new Set<FinalReviewSnapshotRequestedAction>(["request_final_review", "merge_finalization"]);

function base(input: FinalReviewHandoffSnapshotInput): Pick<
  FinalReviewHandoffSnapshotVerdict,
  "snapshot_id" | "branch" | "head_sha"
> {
  return {
    snapshot_id: input.snapshot_id.trim() || null,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
  };
}

function block(
  input: FinalReviewHandoffSnapshotInput,
  action: Exclude<FinalReviewHandoffAction, "admit_final_review_handoff">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): FinalReviewHandoffSnapshotVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    warnings: [],
    blockers,
    next_route: nextRoute,
  };
}

function surfaces(input: FinalReviewHandoffSnapshotInput): FinalReviewSnapshotSurface[] {
  return [input.status, input.mergeability, input.blockers, input.feedback];
}

function surfaceLabel(surface: FinalReviewSnapshotSurface): string {
  return `${surface.surface_id}@${surface.branch}:${surface.head_sha}`;
}

function allEvidence(input: FinalReviewHandoffSnapshotInput): string[] {
  return surfaces(input).flatMap((surface) => [surfaceLabel(surface), ...surface.evidence]);
}

export function compileFinalReviewHandoffSnapshot(
  input: FinalReviewHandoffSnapshotInput,
): FinalReviewHandoffSnapshotVerdict {
  const snapshotId = input.snapshot_id.trim();
  const evidence = [`snapshot ${snapshotId || "<missing>"}`, `live head ${input.live_head_sha}`, ...allEvidence(input)];

  if (!snapshotId || input.spent_snapshot_ids.includes(snapshotId)) {
    return block(
      input,
      "block_reused_snapshot",
      [snapshotId ? `final review snapshot already spent: ${snapshotId}` : "final review snapshot has no id"],
      "compile a fresh single-head final review snapshot before requesting review or merge finalization",
      evidence,
    );
  }

  if (NON_PROGRESS_ACTIONS.has(input.requested_action)) {
    return block(
      input,
      "block_non_progress_action",
      [`${input.requested_action} cannot consume a final-review handoff snapshot as progress`],
      "use the snapshot only for final review handoff, merge finalization, fresh status readback, or an exact blocker",
      evidence,
    );
  }

  const wrongBranch = surfaces(input).find((surface) => surface.branch !== input.active_branch);
  if (wrongBranch) {
    return block(
      input,
      "block_branch_mismatch",
      [`${wrongBranch.surface_id} is on ${wrongBranch.branch}, not ${input.active_branch}`],
      "rebuild the final-review snapshot from active-branch surfaces only",
      evidence,
    );
  }

  const wrongHead = surfaces(input).find((surface) => surface.head_sha !== input.live_head_sha);
  if (wrongHead) {
    return block(
      input,
      "block_snapshot_head_mismatch",
      [`${wrongHead.surface_id} belongs to ${wrongHead.head_sha}, not live head ${input.live_head_sha}`],
      "discard mixed-head finalization evidence and rebuild the snapshot from one live PR head",
      evidence,
    );
  }

  if (input.status.verdict === "failure" || input.status.verdict === "pending") {
    return block(
      input,
      "block_status_not_successful",
      [`status is ${input.status.verdict} for live head ${input.live_head_sha}`],
      "resolve or read the live-head status surface before final review handoff",
      evidence,
    );
  }

  if (input.mergeability.mergeable !== true) {
    return block(
      input,
      "block_status_not_successful",
      [input.mergeability.mergeable === false ? "live PR metadata says not mergeable" : "live PR mergeability is unknown"],
      "read a concrete mergeability verdict or repair mergeability before final review handoff",
      evidence,
    );
  }

  if (input.blockers.verdict !== "retired") {
    return block(
      input,
      "block_active_blocker",
      [
        input.blockers.verdict === "active"
          ? `active blockers remain: ${input.blockers.blocker_ids.join(", ") || "<unnamed>"}`
          : "blocker retirement state is unknown",
      ],
      "retire or name the live external blocker before final review handoff",
      evidence,
    );
  }

  if (input.feedback.verdict === "changes_requested" || input.feedback.repair_items.length > 0) {
    return block(
      input,
      "block_review_repair_needed",
      [
        input.feedback.repair_items.length > 0
          ? `review repair items remain: ${input.feedback.repair_items.join(", ")}`
          : "review changes requested on the live head",
      ],
      "repair live-head review feedback before review-ready or merge-finalization handoff",
      evidence,
    );
  }

  const nextRoute = HANDOFF_ACTIONS.has(input.requested_action)
    ? "handoff may proceed only while this exact head remains live; any branch movement requires a new snapshot"
    : "status is already represented in this snapshot; use it to choose final review handoff or emit the exact blocker";

  return {
    ...base(input),
    ok: true,
    action: "admit_final_review_handoff",
    decisive_evidence: [
      `snapshot ${snapshotId}`,
      `action ${input.requested_action}`,
      `live head ${input.live_head_sha}`,
      "status successful",
      "mergeable true",
      "blockers retired",
      `review ${input.feedback.verdict}`,
      ...allEvidence(input),
    ],
    warnings: input.status.warnings,
    blockers: [],
    next_route: nextRoute,
  };
}
