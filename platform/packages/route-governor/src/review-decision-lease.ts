import type { ReviewResponseIntakeVerdict } from "./review-response-intake.js";

export type ReviewDecisionLeaseNextAction =
  | "merge_gate"
  | "review_repair"
  | "wait_for_review"
  | "exact_external_blocker"
  | "metadata_reread"
  | "duplicate_comment";

export type ReviewDecisionLeaseAction =
  | "admit_merge_gate_decision"
  | "admit_review_repair_decision"
  | "wait_for_review_decision"
  | "emit_review_decision_blocker"
  | "block_branch_mismatch"
  | "block_stale_intake_head"
  | "block_unadmitted_intake"
  | "block_repeated_decision_lease"
  | "block_missing_lease_id"
  | "block_non_progress_action"
  | "block_action_mismatch"
  | "block_incomplete_repair_boundaries";

export interface ReviewDecisionRepairBoundary {
  reviewer: string;
  file_paths: string[];
  summary: string;
}

export interface ReviewDecisionLeaseInput {
  active_branch: string;
  live_head_sha: string;
  lease_id: string;
  spent_lease_ids: string[];
  intake: ReviewResponseIntakeVerdict;
  requested_next_action: ReviewDecisionLeaseNextAction;
  repair_boundaries?: ReviewDecisionRepairBoundary[];
  known_external_blocker?: string;
}

export interface ReviewDecisionLeaseVerdict {
  ok: boolean;
  action: ReviewDecisionLeaseAction;
  lease_id: string | null;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_ACTIONS = new Set<ReviewDecisionLeaseNextAction>(["metadata_reread", "duplicate_comment"]);

function normalize(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function base(input: ReviewDecisionLeaseInput): Pick<ReviewDecisionLeaseVerdict, "lease_id" | "branch" | "head_sha"> {
  return {
    lease_id: input.lease_id.trim() || null,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
  };
}

function block(
  input: ReviewDecisionLeaseInput,
  action: Exclude<
    ReviewDecisionLeaseAction,
    | "admit_merge_gate_decision"
    | "admit_review_repair_decision"
    | "wait_for_review_decision"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ReviewDecisionLeaseVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function liveEvidence(input: ReviewDecisionLeaseInput): string[] {
  return [
    `lease ${input.lease_id.trim() || "<missing>"}`,
    `intake action ${input.intake.action}`,
    `live head ${input.live_head_sha}`,
    `intake head ${input.intake.head_sha}`,
    `branch ${input.active_branch}`,
  ];
}

function boundaryByReviewer(input: ReviewDecisionLeaseInput): Map<string, ReviewDecisionRepairBoundary> {
  const boundaries = new Map<string, ReviewDecisionRepairBoundary>();

  for (const boundary of input.repair_boundaries ?? []) {
    const reviewer = boundary.reviewer.trim().toLowerCase();
    if (!reviewer) continue;
    boundaries.set(reviewer, {
      reviewer: boundary.reviewer.trim(),
      file_paths: normalize(boundary.file_paths),
      summary: boundary.summary.trim(),
    });
  }

  return boundaries;
}

function missingRepairBoundaries(input: ReviewDecisionLeaseInput): string[] {
  const byReviewer = boundaryByReviewer(input);
  const blockers: string[] = [];

  for (const reviewer of input.intake.change_requests) {
    const boundary = byReviewer.get(reviewer.toLowerCase());
    if (!boundary) {
      blockers.push(`review repair for ${reviewer} has no bounded repair boundary`);
      continue;
    }

    if (boundary.file_paths.length === 0) {
      blockers.push(`review repair for ${reviewer} has no file-bound repair path`);
    }

    if (!boundary.summary) {
      blockers.push(`review repair for ${reviewer} has no repair summary`);
    }
  }

  return blockers;
}

export function leaseReviewDecision(input: ReviewDecisionLeaseInput): ReviewDecisionLeaseVerdict {
  const evidence = liveEvidence(input);
  const leaseId = input.lease_id.trim();

  if (!leaseId) {
    return block(
      input,
      "block_missing_lease_id",
      ["review decision lease has no id"],
      "issue a fresh review decision lease id before merge, repair, or waiting routes",
      evidence,
    );
  }

  if (input.spent_lease_ids.includes(leaseId)) {
    return block(
      input,
      "block_repeated_decision_lease",
      [`review decision lease already spent: ${leaseId}`],
      "issue a new live-head review decision lease before consuming review intake again",
      evidence,
    );
  }

  if (input.intake.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`review intake branch ${input.intake.branch} does not match active branch ${input.active_branch}`],
      "discard cross-branch review intake before merge, repair, or waiting routes",
      evidence,
    );
  }

  if (input.intake.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_intake_head",
      [`review intake head ${input.intake.head_sha} is not live head ${input.live_head_sha}`],
      "refresh review response intake after any PR head movement before consuming review decisions",
      evidence,
    );
  }

  if (NON_PROGRESS_ACTIONS.has(input.requested_next_action)) {
    return block(
      input,
      "block_non_progress_action",
      [`${input.requested_next_action} cannot consume a review decision lease as progress`],
      "route the live-head review decision to merge gate, bounded repair, waiting, or one exact blocker",
      evidence,
    );
  }

  const exactBlocker = input.known_external_blocker?.trim();
  if (exactBlocker) {
    if (input.requested_next_action !== "exact_external_blocker") {
      return block(
        input,
        "block_action_mismatch",
        [`known review blocker requires exact_external_blocker, got ${input.requested_next_action}`],
        "emit the named external review blocker before merge, repair, or waiting routes",
        [...evidence, exactBlocker],
      );
    }

    return block(
      input,
      "emit_review_decision_blocker",
      [exactBlocker],
      "remove the named review decision blocker before consuming review intake again",
      [...evidence, exactBlocker],
    );
  }

  if (input.intake.action === "route_to_merge_gate") {
    if (!input.intake.ok) {
      return block(
        input,
        "block_unadmitted_intake",
        input.intake.blockers.length > 0 ? input.intake.blockers : ["merge-gate intake is not admitted"],
        "obtain admitted review-response intake before merge gate routing",
        evidence,
      );
    }

    if (input.requested_next_action !== "merge_gate") {
      return block(
        input,
        "block_action_mismatch",
        [`approved review intake requires merge_gate, got ${input.requested_next_action}`],
        "route approved live-head review intake to merge gate only",
        evidence,
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_merge_gate_decision",
      decisive_evidence: [
        ...evidence,
        `lease ${leaseId}`,
        ...input.intake.approvals.map((reviewer) => `approved by ${reviewer}`),
      ],
      blockers: [],
      next_route: "consume this lease once, then refresh live-head status and mergeability before merge command",
    };
  }

  if (input.intake.action === "route_to_review_repair") {
    if (input.requested_next_action !== "review_repair") {
      return block(
        input,
        "block_action_mismatch",
        [`change-request review intake requires review_repair, got ${input.requested_next_action}`],
        "route live-head change requests to bounded review repair only",
        evidence,
      );
    }

    const repairBlockers = missingRepairBoundaries(input);
    if (repairBlockers.length > 0) {
      return block(
        input,
        "block_incomplete_repair_boundaries",
        repairBlockers,
        "bind each live-head change request to file paths and a repair summary before changing code",
        evidence,
      );
    }

    const boundaries = [...boundaryByReviewer(input).values()];
    return {
      ...base(input),
      ok: true,
      action: "admit_review_repair_decision",
      decisive_evidence: [
        ...evidence,
        `lease ${leaseId}`,
        ...boundaries.flatMap((boundary) => [
          `repair reviewer ${boundary.reviewer}`,
          ...boundary.file_paths.map((path) => `repair path ${path}`),
        ]),
      ],
      blockers: [],
      next_route: "repair only the leased file-bound live-head review changes, then refresh status after the branch moves",
    };
  }

  if (input.intake.action === "wait_for_review_response") {
    if (input.requested_next_action !== "wait_for_review") {
      return block(
        input,
        "block_action_mismatch",
        [`pending review intake requires wait_for_review, got ${input.requested_next_action}`],
        "wait for the live-head review response or emit an exact external blocker if one appears",
        evidence,
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "wait_for_review_decision",
      decisive_evidence: [
        ...evidence,
        `lease ${leaseId}`,
        ...input.intake.pending_reviewers.map((reviewer) => `pending reviewer ${reviewer}`),
      ],
      blockers: input.intake.blockers,
      next_route: "do not substitute metadata rereads or duplicate comments for live-head review response movement",
    };
  }

  return block(
    input,
    "block_unadmitted_intake",
    input.intake.blockers.length > 0 ? input.intake.blockers : [`review intake action is ${input.intake.action}`],
    "consume only admitted merge, bounded repair, waiting, or exact-blocker review intake decisions",
    evidence,
  );
}
