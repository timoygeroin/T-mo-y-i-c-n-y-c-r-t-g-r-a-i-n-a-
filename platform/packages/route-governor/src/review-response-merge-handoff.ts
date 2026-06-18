import type { ReviewResponseIntakeVerdict } from "./review-response-intake.js";
import {
  compilePostRepairMergeHandoff,
  type PostRepairMergeHandoffStatusVerdict,
  type PostRepairMergeHandoffVerdict,
  type PostRepairMergeStatusSurface,
} from "./post-repair-merge-handoff.js";

export type ReviewResponseMergeHandoffAction =
  | "compile_merge_handoff"
  | "route_to_review_repair"
  | "wait_for_review_response"
  | "emit_review_response_blocker"
  | "block_unapproved_response"
  | "block_unready_merge_handoff";

export interface ReviewResponseMergeStatusSurface {
  surface_id: string;
  head_sha: string;
  verdict: PostRepairMergeHandoffStatusVerdict;
  decisive_successes: string[];
  blockers: string[];
  warnings: string[];
}

export interface ReviewResponseMergeHandoffInput {
  response: ReviewResponseIntakeVerdict;
  status_surface?: ReviewResponseMergeStatusSurface;
  repaired_head_sha: string;
  last_status_readback_head_sha: string;
  resolved_blocker_ids: string[];
  draft: boolean;
  mergeable: boolean;
  required_approval_count: number;
}

export interface ReviewResponseMergeHandoffVerdict {
  ok: boolean;
  action: ReviewResponseMergeHandoffAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  approvals: string[];
  change_requests: string[];
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
  merge_handoff?: PostRepairMergeHandoffVerdict;
}

function base(input: ReviewResponseMergeHandoffInput): Pick<
  ReviewResponseMergeHandoffVerdict,
  "repository_full_name" | "pr_number" | "branch" | "head_sha" | "approvals" | "change_requests" | "warnings"
> {
  return {
    repository_full_name: input.response.repository_full_name,
    pr_number: input.response.pr_number,
    branch: input.response.branch,
    head_sha: input.response.head_sha,
    approvals: input.response.approvals,
    change_requests: input.response.change_requests,
    warnings: input.status_surface?.warnings ?? [],
  };
}

function block(
  input: ReviewResponseMergeHandoffInput,
  action: Exclude<ReviewResponseMergeHandoffAction, "compile_merge_handoff">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = input.response.decisive_evidence,
): ReviewResponseMergeHandoffVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function toPostRepairStatusSurface(surface: ReviewResponseMergeStatusSurface): PostRepairMergeStatusSurface {
  return {
    surface_id: surface.surface_id,
    head_sha: surface.head_sha,
    verdict: surface.verdict,
    decisive_successes: surface.decisive_successes,
    blockers: surface.blockers,
    warnings: surface.warnings,
  };
}

export function compileReviewResponseMergeHandoff(
  input: ReviewResponseMergeHandoffInput,
): ReviewResponseMergeHandoffVerdict {
  const response = input.response;

  if (response.action === "route_to_review_repair") {
    return block(
      input,
      "route_to_review_repair",
      response.blockers.length > 0 ? response.blockers : response.change_requests.map((reviewer) => `review changes requested by ${reviewer}`),
      "repair live-head review changes before compiling any merge handoff",
    );
  }

  if (response.action === "wait_for_review_response") {
    return block(
      input,
      "wait_for_review_response",
      response.pending_reviewers.length > 0
        ? response.pending_reviewers.map((reviewer) => `waiting for review response from ${reviewer}`)
        : response.blockers,
      "wait for the requested live-head review response before merge handoff",
    );
  }

  if (response.action === "emit_review_response_blocker") {
    return block(
      input,
      "emit_review_response_blocker",
      response.blockers,
      "remove the named external review-response blocker before merge handoff",
    );
  }

  if (!response.ok || response.action !== "route_to_merge_gate") {
    return block(
      input,
      "block_unapproved_response",
      response.blockers.length > 0 ? response.blockers : [`review response action ${response.action} is not merge-gate approval`],
      "obtain a live-head approval response before compiling merge handoff",
    );
  }

  const mergeHandoff = compilePostRepairMergeHandoff({
    repository_full_name: response.repository_full_name,
    pr_number: response.pr_number,
    active_branch: response.branch,
    candidate_branch: response.branch,
    live_head_sha: response.head_sha,
    repaired_head_sha: input.repaired_head_sha,
    last_status_readback_head_sha: input.last_status_readback_head_sha,
    resolved_blocker_ids: input.resolved_blocker_ids,
    draft: input.draft,
    mergeable: input.mergeable,
    requested_intent: "merge",
    status_surface: input.status_surface ? toPostRepairStatusSurface(input.status_surface) : undefined,
    required_approval_count: input.required_approval_count,
    approval_count: response.approvals.length,
  });

  if (!mergeHandoff.ok || mergeHandoff.action !== "admit_merge_handoff") {
    return {
      ...base(input),
      ok: false,
      action: "block_unready_merge_handoff",
      decisive_evidence: [...response.decisive_evidence, ...mergeHandoff.decisive_evidence],
      blockers: mergeHandoff.blockers,
      warnings: mergeHandoff.warnings,
      next_route: mergeHandoff.next_route,
      merge_handoff: mergeHandoff,
    };
  }

  return {
    ...base(input),
    ok: true,
    action: "compile_merge_handoff",
    decisive_evidence: [...response.decisive_evidence, ...mergeHandoff.decisive_evidence],
    blockers: [],
    warnings: mergeHandoff.warnings,
    next_route: "compile the guarded GitHub merge command only while the PR head still matches the approved response",
    merge_handoff: mergeHandoff,
  };
}
