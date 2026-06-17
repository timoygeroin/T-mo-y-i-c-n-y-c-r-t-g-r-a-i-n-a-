import {
  compileLiveStatusAuthority,
  type LiveStatusAuthorityAction,
  type LiveStatusEvidenceSurface,
} from "./live-status-authority.js";
import {
  admitReviewThreadResolution,
  type ReviewThreadResolutionAction,
  type ReviewThreadSurface,
} from "./review-thread-resolution-admission.js";
import { compileMergeReadiness, type MergeabilityState, type MergeReadinessAction } from "./merge-readiness.js";
import {
  compileMergeFinalizationCommand,
  type MergeFinalizationBoundary,
  type MergeFinalizationCommand,
  type MergeFinalizationAction,
} from "./merge-finalization-command.js";

export type ReviewMergeFinalizationGateAction =
  | "compile_review_bound_merge_command"
  | "route_to_live_status_authority"
  | "route_to_review_thread_admission"
  | "route_to_merge_readiness"
  | "route_to_merge_command_boundary";

export interface ReviewMergeFinalizationGateInput {
  repository_full_name: string;
  pr_number: number;
  branch: string;
  active_branch: string;
  live_head_sha: string;
  draft: boolean;
  mergeable: MergeabilityState;
  required_approval_count: number;
  approvals: string[];
  change_requests: string[];
  review_threads: ReviewThreadSurface[];
  status_evidence: LiveStatusEvidenceSurface[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  command_id: string;
  spent_command_ids: string[];
  external_boundary: MergeFinalizationBoundary;
  merge_method: "squash" | "merge" | "rebase";
}

export interface ReviewMergeFinalizationGateVerdict {
  ok: boolean;
  action: ReviewMergeFinalizationGateAction;
  status_action: LiveStatusAuthorityAction;
  review_action: ReviewThreadResolutionAction | null;
  readiness_action: MergeReadinessAction | null;
  command_action: MergeFinalizationAction | null;
  command: MergeFinalizationCommand | null;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

function statusSurfaceFromAuthority(authority: ReturnType<typeof compileLiveStatusAuthority>) {
  if (authority.ok) {
    return {
      verdict: authority.warnings.length > 0 ? "passing_with_warnings" : "passing",
      ok: true,
      decisive_successes: authority.decisive_evidence,
      blocking_failures: [],
      pending_surfaces: [],
      non_blocking_warnings: authority.warnings,
    } as const;
  }

  const isPending = authority.action === "hold_for_live_status";
  return {
    verdict: isPending ? "pending" : "failing",
    ok: false,
    decisive_successes: [],
    blocking_failures: isPending ? [] : authority.blockers,
    pending_surfaces: isPending ? authority.blockers : [],
    non_blocking_warnings: authority.warnings,
  } as const;
}

function block(
  input: ReviewMergeFinalizationGateInput,
  action: Exclude<ReviewMergeFinalizationGateAction, "compile_review_bound_merge_command">,
  status_action: LiveStatusAuthorityAction,
  review_action: ReviewThreadResolutionAction | null,
  readiness_action: MergeReadinessAction | null,
  command_action: MergeFinalizationAction | null,
  decisive_evidence: string[],
  blockers: string[],
  warnings: string[],
  next_route: string,
): ReviewMergeFinalizationGateVerdict {
  return {
    ok: false,
    action,
    status_action,
    review_action,
    readiness_action,
    command_action,
    command: null,
    branch: input.branch,
    head_sha: input.live_head_sha,
    decisive_evidence,
    blockers,
    warnings,
    next_route,
  };
}

export function compileReviewMergeFinalizationGate(
  input: ReviewMergeFinalizationGateInput,
): ReviewMergeFinalizationGateVerdict {
  const statusAuthority = compileLiveStatusAuthority({
    branch: input.branch,
    active_branch: input.active_branch,
    live_head_sha: input.live_head_sha,
    evidence: input.status_evidence,
  });
  const statusSurface = statusSurfaceFromAuthority(statusAuthority);

  if (!statusAuthority.ok) {
    return block(
      input,
      "route_to_live_status_authority",
      statusAuthority.action,
      null,
      null,
      null,
      statusAuthority.decisive_evidence,
      statusAuthority.blockers,
      statusAuthority.warnings,
      statusAuthority.next_route,
    );
  }

  const reviewAdmission = admitReviewThreadResolution({
    repository_full_name: input.repository_full_name,
    pr_number: input.pr_number,
    branch: input.branch,
    live_head_sha: input.live_head_sha,
    required_approval_count: input.required_approval_count,
    approvals: input.approvals,
    change_requests: input.change_requests,
    review_threads: input.review_threads,
  });

  if (!reviewAdmission.ok) {
    return block(
      input,
      "route_to_review_thread_admission",
      statusAuthority.action,
      reviewAdmission.action,
      null,
      null,
      [...statusAuthority.decisive_evidence, ...reviewAdmission.decisive_evidence],
      reviewAdmission.blockers,
      statusAuthority.warnings,
      reviewAdmission.next_route,
    );
  }

  const readiness = compileMergeReadiness({
    repository_full_name: input.repository_full_name,
    pr_number: input.pr_number,
    branch: input.branch,
    active_branch: input.active_branch,
    head_sha: input.live_head_sha,
    draft: input.draft,
    mergeable: input.mergeable,
    status_surface: statusSurface,
    evidence: {
      executable_artifacts: input.executable_artifacts,
      routing_artifacts: input.routing_artifacts,
      status_surface_ids: statusAuthority.accepted_surface_ids,
    },
  });

  if (!readiness.ok || readiness.action !== "merge_ready") {
    return block(
      input,
      "route_to_merge_readiness",
      statusAuthority.action,
      reviewAdmission.action,
      readiness.action,
      null,
      [...statusAuthority.decisive_evidence, ...reviewAdmission.decisive_evidence, ...readiness.decisive_evidence],
      readiness.blockers,
      readiness.warnings,
      readiness.next_route,
    );
  }

  const command = compileMergeFinalizationCommand({
    readiness,
    live_head_sha: input.live_head_sha,
    command_id: input.command_id,
    spent_command_ids: input.spent_command_ids,
    external_boundary: input.external_boundary,
    merge_method: input.merge_method,
  });

  if (!command.ok || !command.command) {
    return block(
      input,
      "route_to_merge_command_boundary",
      statusAuthority.action,
      reviewAdmission.action,
      readiness.action,
      command.action,
      command.decisive_evidence,
      command.blockers,
      readiness.warnings,
      command.next_route,
    );
  }

  return {
    ok: true,
    action: "compile_review_bound_merge_command",
    status_action: statusAuthority.action,
    review_action: reviewAdmission.action,
    readiness_action: readiness.action,
    command_action: command.action,
    command: command.command,
    branch: input.branch,
    head_sha: input.live_head_sha,
    decisive_evidence: [
      ...statusAuthority.decisive_evidence,
      ...reviewAdmission.decisive_evidence,
      ...readiness.decisive_evidence,
      ...command.decisive_evidence,
    ],
    blockers: [],
    warnings: readiness.warnings,
    next_route: "execute only the guarded GitHub pull-request merge command, or re-enter status and review admission if the head moves",
  };
}
