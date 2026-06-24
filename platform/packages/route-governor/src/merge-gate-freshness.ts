import type { MergeReadinessVerdict } from "./merge-readiness.js";
import type { ReviewResponseIntakeVerdict } from "./review-response-intake.js";

export type MergeGateFreshnessAction =
  | "admit_fresh_merge_gate"
  | "block_missing_gate_id"
  | "block_replayed_gate_id"
  | "block_target_mismatch"
  | "block_stale_review_gate"
  | "block_stale_readiness_gate"
  | "block_unapproved_review_gate"
  | "block_unready_merge_gate";

export interface MergeGateFreshnessInput {
  review_intake: ReviewResponseIntakeVerdict;
  merge_readiness: MergeReadinessVerdict;
  live_head_sha: string;
  gate_id: string;
  spent_gate_ids: string[];
}

export interface MergeGateFreshnessVerdict {
  ok: boolean;
  action: MergeGateFreshnessAction;
  gate_id: string | null;
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

function base(input: MergeGateFreshnessInput): Pick<
  MergeGateFreshnessVerdict,
  "repository_full_name" | "pr_number" | "branch" | "head_sha" | "warnings"
> {
  return {
    repository_full_name: input.review_intake.repository_full_name,
    pr_number: input.review_intake.pr_number,
    branch: input.review_intake.branch,
    head_sha: input.live_head_sha,
    warnings: input.merge_readiness.warnings,
  };
}

function block(
  input: MergeGateFreshnessInput,
  action: Exclude<MergeGateFreshnessAction, "admit_fresh_merge_gate">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): MergeGateFreshnessVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    gate_id: null,
    approvals: input.review_intake.approvals,
    decisive_evidence: [
      `review action ${input.review_intake.action}`,
      `review head ${input.review_intake.head_sha}`,
      `readiness action ${input.merge_readiness.action}`,
      `readiness head ${input.merge_readiness.head_sha}`,
      `live head ${input.live_head_sha}`,
      ...evidence,
    ],
    blockers,
    next_route: nextRoute,
  };
}

function sameTarget(input: MergeGateFreshnessInput): boolean {
  return (
    input.review_intake.repository_full_name === input.merge_readiness.repository_full_name &&
    input.review_intake.pr_number === input.merge_readiness.pr_number &&
    input.review_intake.branch === input.merge_readiness.branch
  );
}

export function compileMergeGateFreshness(input: MergeGateFreshnessInput): MergeGateFreshnessVerdict {
  const gateId = input.gate_id.trim();

  if (!gateId) {
    return block(
      input,
      "block_missing_gate_id",
      ["merge gate freshness has no gate id"],
      "compile every review-to-merge gate with a durable gate id",
    );
  }

  if (input.spent_gate_ids.includes(gateId)) {
    return block(
      input,
      "block_replayed_gate_id",
      [`merge gate freshness id already spent: ${gateId}`],
      "compile a new gate only from fresh live-head review and merge-readiness evidence",
      [gateId],
    );
  }

  if (!sameTarget(input)) {
    return block(
      input,
      "block_target_mismatch",
      ["review intake and merge readiness do not target the same repository, PR, and branch"],
      "rebuild review intake and merge readiness from the same live PR surface",
    );
  }

  if (input.review_intake.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_review_gate",
      [`review intake head ${input.review_intake.head_sha} is not live head ${input.live_head_sha}`],
      "discard stale review approval and read review responses for the live PR head",
    );
  }

  if (input.merge_readiness.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_readiness_gate",
      [`merge readiness head ${input.merge_readiness.head_sha} is not live head ${input.live_head_sha}`],
      "refresh status and mergeability before entering the merge gate",
    );
  }

  if (!input.review_intake.ok || input.review_intake.action !== "route_to_merge_gate") {
    return block(
      input,
      "block_unapproved_review_gate",
      [
        ...input.review_intake.blockers,
        `review intake action is ${input.review_intake.action}, not route_to_merge_gate`,
      ],
      "wait for live-head approval or route to review repair before merge readiness can advance",
    );
  }

  if (!input.merge_readiness.ok || input.merge_readiness.action !== "merge_ready") {
    return block(
      input,
      "block_unready_merge_gate",
      [
        ...input.merge_readiness.blockers,
        `merge readiness action is ${input.merge_readiness.action}, not merge_ready`,
      ],
      "resolve live-head status or mergeability blockers before compiling merge commands",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_fresh_merge_gate",
    gate_id: gateId,
    approvals: input.review_intake.approvals,
    decisive_evidence: [
      `gate ${gateId}`,
      `live head ${input.live_head_sha}`,
      ...input.review_intake.approvals.map((reviewer) => `approved by ${reviewer}`),
      ...input.review_intake.decisive_evidence,
      ...input.merge_readiness.decisive_evidence,
    ],
    blockers: [],
    next_route: "compile a merge command only from this fresh live-head gate; do not let review approval, status, or mergeability travel across a later head move",
  };
}
