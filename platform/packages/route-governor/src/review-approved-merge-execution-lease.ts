import type { MergeFinalizationBoundary, MergeFinalizationCommand } from "./merge-finalization-command.js";
import type { ReviewApprovedMergeCommandVerdict } from "./review-approved-merge-command.js";

export type ReviewApprovedMergeExecutionLeaseAction =
  | "compile_review_approved_merge_execution_lease"
  | "block_uncompiled_review_merge"
  | "block_stale_command_head"
  | "block_replayed_execution_lease"
  | "block_merge_operation_boundary"
  | "block_missing_lease_id";

export interface ReviewApprovedMergeExecutionLeaseInput {
  review_approved_command: ReviewApprovedMergeCommandVerdict;
  live_head_sha: string;
  lease_id: string;
  spent_lease_ids: string[];
  external_boundary: MergeFinalizationBoundary;
}

export interface ReviewApprovedMergeExecutionLease {
  lease_id: string;
  operation: "merge_pull_request";
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  merge_method: MergeFinalizationCommand["merge_method"];
  guard: {
    require_live_head_sha: string;
    require_review_approved_command: true;
    forbidden_fallbacks: string[];
  };
}

export interface ReviewApprovedMergeExecutionLeaseVerdict {
  ok: boolean;
  action: ReviewApprovedMergeExecutionLeaseAction;
  lease: ReviewApprovedMergeExecutionLease | null;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

function baseEvidence(input: ReviewApprovedMergeExecutionLeaseInput): string[] {
  return [
    `command action ${input.review_approved_command.action}`,
    `live head ${input.live_head_sha}`,
    `external boundary ${input.external_boundary}`,
  ];
}

function block(
  action: Exclude<ReviewApprovedMergeExecutionLeaseAction, "compile_review_approved_merge_execution_lease">,
  evidence: string[],
  blockers: string[],
  warnings: string[],
  nextRoute: string,
): ReviewApprovedMergeExecutionLeaseVerdict {
  return {
    ok: false,
    action,
    lease: null,
    decisive_evidence: evidence,
    blockers,
    warnings,
    next_route: nextRoute,
  };
}

export function compileReviewApprovedMergeExecutionLease(
  input: ReviewApprovedMergeExecutionLeaseInput,
): ReviewApprovedMergeExecutionLeaseVerdict {
  const evidence = baseEvidence(input);
  const warnings = input.review_approved_command.warnings;
  const command = input.review_approved_command.command;

  if (
    !input.review_approved_command.ok ||
    input.review_approved_command.action !== "compile_review_approved_merge_command" ||
    !command
  ) {
    return block(
      "block_uncompiled_review_merge",
      [...evidence, ...input.review_approved_command.decisive_evidence],
      [
        ...input.review_approved_command.blockers,
        `review-approved command action is ${input.review_approved_command.action}`,
      ],
      warnings,
      "compile a live-head review-approved merge command before leasing merge execution",
    );
  }

  if (command.operation !== "merge_pull_request") {
    return block(
      "block_merge_operation_boundary",
      [...evidence, `command operation ${command.operation}`],
      [`review-approved command operation is ${command.operation}, not merge_pull_request`],
      warnings,
      "use only the GitHub pull-request merge operation for review-approved merge execution",
    );
  }

  if (input.external_boundary !== "github_pull_request_merge") {
    return block(
      "block_merge_operation_boundary",
      [...evidence, `command ${command.command_id}`],
      [`review-approved merge execution cannot be leased through ${input.external_boundary}`],
      warnings,
      "execute through the GitHub pull-request merge boundary or emit the exact external blocker",
    );
  }

  if (command.head_sha !== input.live_head_sha || command.guard.require_live_head_sha !== input.live_head_sha) {
    return block(
      "block_stale_command_head",
      [
        ...evidence,
        `command ${command.command_id}`,
        `command head ${command.head_sha}`,
        `command guard head ${command.guard.require_live_head_sha}`,
      ],
      [`review-approved merge command is not bound to live head ${input.live_head_sha}`],
      warnings,
      "discard the stale command and recompile review, readiness, and merge command from the live PR head",
    );
  }

  const leaseId = input.lease_id.trim();
  if (!leaseId) {
    return block(
      "block_missing_lease_id",
      [...evidence, `command ${command.command_id}`],
      ["review-approved merge execution lease has no lease id"],
      warnings,
      "issue a durable lease id before attempting merge execution",
    );
  }

  if (input.spent_lease_ids.includes(leaseId)) {
    return block(
      "block_replayed_execution_lease",
      [...evidence, `command ${command.command_id}`, `lease ${leaseId}`],
      [`review-approved merge execution lease already spent: ${leaseId}`],
      warnings,
      "do not replay a spent merge execution lease; reread the live head and compile a new lease if still valid",
    );
  }

  const lease: ReviewApprovedMergeExecutionLease = {
    lease_id: leaseId,
    operation: "merge_pull_request",
    repository_full_name: command.repository_full_name,
    pr_number: command.pr_number,
    branch: command.branch,
    head_sha: command.head_sha,
    merge_method: command.merge_method,
    guard: {
      require_live_head_sha: input.live_head_sha,
      require_review_approved_command: true,
      forbidden_fallbacks: [
        ...command.guard.forbidden_fallbacks,
        "comment_as_merge_execution",
        "status_readback_as_merge_execution",
        "local_memory_as_merge_execution",
        "replayed_merge_lease",
      ],
    },
  };

  return {
    ok: true,
    action: "compile_review_approved_merge_execution_lease",
    lease,
    decisive_evidence: [
      ...evidence,
      `command ${command.command_id}`,
      `lease ${leaseId}`,
      `head ${command.head_sha}`,
      `merge method ${command.merge_method}`,
      ...input.review_approved_command.decisive_evidence,
    ],
    blockers: [],
    warnings,
    next_route: "execute the leased GitHub merge command once, then compile the merge result receipt for the same live head",
  };
}
