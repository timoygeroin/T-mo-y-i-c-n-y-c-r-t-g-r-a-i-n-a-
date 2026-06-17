import { compileMergeReadiness, type MergeReadinessInput, type MergeReadinessVerdict } from "./merge-readiness.js";
import type { ReviewResponseIntakeVerdict } from "./review-response-intake.js";

export type ReviewResponseMergeReadinessAction =
  | "route_to_merge_ready"
  | "read_current_head_status"
  | "wait_for_checks"
  | "repair_status_failure"
  | "continue_external_embodiment"
  | "route_to_review_repair"
  | "wait_for_review_response"
  | "emit_exact_external_blocker"
  | "block_stale_merge_readiness_input";

export interface ReviewResponseMergeReadinessInput {
  review: ReviewResponseIntakeVerdict;
  merge_readiness: MergeReadinessInput;
}

export interface ReviewResponseMergeReadinessVerdict {
  ok: boolean;
  action: ReviewResponseMergeReadinessAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  review_action: ReviewResponseIntakeVerdict["action"];
  merge_readiness: MergeReadinessVerdict | null;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

function base(input: ReviewResponseMergeReadinessInput): Pick<
  ReviewResponseMergeReadinessVerdict,
  "repository_full_name" | "pr_number" | "branch" | "head_sha" | "review_action"
> {
  return {
    repository_full_name: input.review.repository_full_name,
    pr_number: input.review.pr_number,
    branch: input.review.branch,
    head_sha: input.review.head_sha,
    review_action: input.review.action,
  };
}

function block(
  input: ReviewResponseMergeReadinessInput,
  action: Exclude<ReviewResponseMergeReadinessAction, "route_to_merge_ready">,
  blockers: string[],
  nextRoute: string,
  decisiveEvidence: string[] = input.review.decisive_evidence,
): ReviewResponseMergeReadinessVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    merge_readiness: null,
    decisive_evidence: decisiveEvidence,
    blockers,
    warnings: [],
    next_route: nextRoute,
  };
}

function staleMergeReadinessBlockers(input: ReviewResponseMergeReadinessInput): string[] {
  const blockers: string[] = [];
  const merge = input.merge_readiness;
  const review = input.review;

  if (merge.repository_full_name !== review.repository_full_name) {
    blockers.push(`merge readiness repo ${merge.repository_full_name} does not match review repo ${review.repository_full_name}`);
  }
  if (merge.pr_number !== review.pr_number) {
    blockers.push(`merge readiness PR #${merge.pr_number} does not match review PR #${review.pr_number}`);
  }
  if (merge.branch !== review.branch) {
    blockers.push(`merge readiness branch ${merge.branch} does not match review branch ${review.branch}`);
  }
  if (merge.head_sha !== review.head_sha) {
    blockers.push(`merge readiness head ${merge.head_sha} does not match review head ${review.head_sha}`);
  }

  return blockers;
}

function readinessAction(readiness: MergeReadinessVerdict): ReviewResponseMergeReadinessAction {
  if (readiness.action === "merge_ready") return "route_to_merge_ready";
  return readiness.action;
}

export function routeReviewResponseToMergeReadiness(
  input: ReviewResponseMergeReadinessInput,
): ReviewResponseMergeReadinessVerdict {
  if (input.review.action === "route_to_review_repair") {
    return block(
      input,
      "route_to_review_repair",
      input.review.blockers,
      "repair the live-head review changes before checking merge readiness",
    );
  }

  if (input.review.action === "wait_for_review_response") {
    return block(
      input,
      "wait_for_review_response",
      input.review.blockers,
      "wait for the requested live-head review response before checking merge readiness",
    );
  }

  if (input.review.action !== "route_to_merge_gate") {
    return block(
      input,
      "emit_exact_external_blocker",
      input.review.blockers,
      input.review.next_route,
    );
  }

  const staleBlockers = staleMergeReadinessBlockers(input);
  if (staleBlockers.length > 0) {
    return block(
      input,
      "block_stale_merge_readiness_input",
      staleBlockers,
      "recompile merge readiness from the same live-head review response before merge routing",
      [...input.review.decisive_evidence, ...staleBlockers],
    );
  }

  const readiness = compileMergeReadiness(input.merge_readiness);
  const action = readinessAction(readiness);

  return {
    ...base(input),
    ok: readiness.ok,
    action,
    merge_readiness: readiness,
    decisive_evidence: [...input.review.decisive_evidence, ...readiness.decisive_evidence],
    blockers: readiness.blockers,
    warnings: readiness.warnings,
    next_route:
      action === "route_to_merge_ready"
        ? "compile the guarded GitHub merge command only if the PR head still matches this reviewed merge-ready head"
        : readiness.next_route,
  };
}
