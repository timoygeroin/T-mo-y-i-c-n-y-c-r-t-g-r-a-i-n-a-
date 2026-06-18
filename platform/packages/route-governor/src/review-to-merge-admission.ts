import type { MergeReadinessVerdict } from "./merge-readiness.js";
import type { ReviewResponseIntakeVerdict } from "./review-response-intake.js";

export type ReviewToMergeAdmissionAction =
  | "admit_reviewed_merge_readiness"
  | "route_to_review_repair"
  | "wait_for_review_response"
  | "block_stale_review_head"
  | "block_stale_merge_readiness"
  | "block_unready_review_gate"
  | "block_unready_merge_gate"
  | "block_replayed_admission"
  | "block_target_mismatch";

export interface ReviewToMergeAdmissionInput {
  admission_id: string;
  spent_admission_ids: string[];
  live_head_sha: string;
  required_approval_count: number;
  review: ReviewResponseIntakeVerdict;
  readiness: MergeReadinessVerdict;
}

export interface ReviewToMergeAdmissionVerdict {
  ok: boolean;
  action: ReviewToMergeAdmissionAction;
  admission_id: string | null;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  approvals: string[];
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

function base(input: ReviewToMergeAdmissionInput): Pick<
  ReviewToMergeAdmissionVerdict,
  "repository_full_name" | "pr_number" | "branch" | "head_sha" | "warnings"
> {
  return {
    repository_full_name: input.readiness.repository_full_name,
    pr_number: input.readiness.pr_number,
    branch: input.readiness.branch,
    head_sha: input.live_head_sha,
    warnings: input.readiness.warnings,
  };
}

function block(
  input: ReviewToMergeAdmissionInput,
  action: Exclude<ReviewToMergeAdmissionAction, "admit_reviewed_merge_readiness">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ReviewToMergeAdmissionVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    admission_id: null,
    approvals: [],
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function targetMismatch(input: ReviewToMergeAdmissionInput): string[] {
  const blockers: string[] = [];

  if (input.review.repository_full_name !== input.readiness.repository_full_name) {
    blockers.push(
      `review repository ${input.review.repository_full_name} does not match readiness repository ${input.readiness.repository_full_name}`,
    );
  }
  if (input.review.pr_number !== input.readiness.pr_number) {
    blockers.push(`review PR ${input.review.pr_number} does not match readiness PR ${input.readiness.pr_number}`);
  }
  if (input.review.branch !== input.readiness.branch) {
    blockers.push(`review branch ${input.review.branch} does not match readiness branch ${input.readiness.branch}`);
  }

  return blockers;
}

export function admitReviewToMerge(input: ReviewToMergeAdmissionInput): ReviewToMergeAdmissionVerdict {
  const admissionId = input.admission_id.trim();
  const evidence = [
    `live head ${input.live_head_sha}`,
    `review action ${input.review.action}`,
    `merge readiness action ${input.readiness.action}`,
  ];

  if (!admissionId || input.spent_admission_ids.includes(admissionId)) {
    return block(
      input,
      "block_replayed_admission",
      [admissionId ? `review-to-merge admission already spent: ${admissionId}` : "review-to-merge admission has no id"],
      "compile each review-to-merge admission with a new durable admission id",
      evidence,
    );
  }

  const mismatch = targetMismatch(input);
  if (mismatch.length > 0) {
    return block(
      input,
      "block_target_mismatch",
      mismatch,
      "bind review intake and merge readiness to the same repository, PR, and branch before merge admission",
      evidence,
    );
  }

  if (input.review.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_review_head",
      [`review intake head ${input.review.head_sha} is not live head ${input.live_head_sha}`],
      "discard stale review intake and read review responses for the live PR head",
      evidence,
    );
  }

  if (input.readiness.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_merge_readiness",
      [`merge readiness head ${input.readiness.head_sha} is not live head ${input.live_head_sha}`],
      "refresh merge readiness from the live PR head before admitting merge",
      evidence,
    );
  }

  if (input.review.action === "route_to_review_repair" || input.review.change_requests.length > 0) {
    return block(
      input,
      "route_to_review_repair",
      input.review.blockers.length > 0 ? input.review.blockers : input.review.change_requests,
      "repair live-head review changes before merge admission",
      [...evidence, ...input.review.decisive_evidence],
    );
  }

  if (input.review.action === "wait_for_review_response") {
    return block(
      input,
      "wait_for_review_response",
      input.review.blockers,
      "wait for live-head approval or name the exact external review blocker before merge admission",
      [...evidence, ...input.review.pending_reviewers.map((reviewer) => `pending reviewer ${reviewer}`)],
    );
  }

  if (!input.review.ok || input.review.action !== "route_to_merge_gate") {
    return block(
      input,
      "block_unready_review_gate",
      input.review.blockers.length > 0
        ? input.review.blockers
        : [`review intake action is ${input.review.action}, not route_to_merge_gate`],
      "obtain live-head review approval before merge admission",
      [...evidence, ...input.review.decisive_evidence],
    );
  }

  if (input.review.approvals.length < Math.max(1, input.required_approval_count)) {
    return block(
      input,
      "block_unready_review_gate",
      [`review approvals ${input.review.approvals.length} below required ${Math.max(1, input.required_approval_count)}`],
      "wait for the required live-head approval count before merge admission",
      [...evidence, ...input.review.decisive_evidence],
    );
  }

  if (!input.readiness.ok || input.readiness.action !== "merge_ready") {
    return block(
      input,
      "block_unready_merge_gate",
      input.readiness.blockers.length > 0
        ? input.readiness.blockers
        : [`merge readiness action is ${input.readiness.action}, not merge_ready`],
      "resolve merge-readiness blockers before compiling merge command",
      [...evidence, ...input.readiness.decisive_evidence],
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_reviewed_merge_readiness",
    admission_id: admissionId,
    approvals: input.review.approvals,
    decisive_evidence: [
      ...evidence,
      `admission ${admissionId}`,
      ...input.review.approvals.map((reviewer) => `approved by ${reviewer}`),
      ...input.review.decisive_evidence,
      ...input.readiness.decisive_evidence,
    ],
    blockers: [],
    next_route: "compile a guarded merge command only for this live head, reviewed approval set, and merge-ready verdict",
  };
}
