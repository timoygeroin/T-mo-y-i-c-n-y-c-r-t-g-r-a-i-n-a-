import { compileMergeFinalizationCommand, type MergeFinalizationBoundary, type MergeFinalizationCommand, type MergeFinalizationCommandVerdict } from "./merge-finalization-command.js";
import type { MergeReadinessVerdict } from "./merge-readiness.js";
import type { ReviewResponseIntakeVerdict } from "./review-response-intake.js";

export type ReviewApprovedMergeCommandAction =
  | "compile_review_approved_merge_command"
  | "block_review_not_approved"
  | "block_stale_review_head"
  | "block_merge_readiness_not_ready"
  | "block_stale_readiness_head"
  | "block_merge_command_compile";

export interface ReviewApprovedMergeCommandInput {
  review_intake: ReviewResponseIntakeVerdict;
  merge_readiness: MergeReadinessVerdict;
  live_head_sha: string;
  command_id: string;
  spent_command_ids: string[];
  external_boundary: MergeFinalizationBoundary;
  merge_method: "squash" | "merge" | "rebase";
}

export interface ReviewApprovedMergeCommandVerdict {
  ok: boolean;
  action: ReviewApprovedMergeCommandAction;
  command: MergeFinalizationCommand | null;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

function baseEvidence(input: ReviewApprovedMergeCommandInput): string[] {
  return [
    `review action ${input.review_intake.action}`,
    `review head ${input.review_intake.head_sha}`,
    `readiness action ${input.merge_readiness.action}`,
    `readiness head ${input.merge_readiness.head_sha}`,
    `live head ${input.live_head_sha}`,
  ];
}

function block(
  action: Exclude<ReviewApprovedMergeCommandAction, "compile_review_approved_merge_command">,
  decisiveEvidence: string[],
  blockers: string[],
  warnings: string[],
  nextRoute: string,
): ReviewApprovedMergeCommandVerdict {
  return {
    ok: false,
    action,
    command: null,
    decisive_evidence: decisiveEvidence,
    blockers,
    warnings,
    next_route: nextRoute,
  };
}

export function compileReviewApprovedMergeCommand(
  input: ReviewApprovedMergeCommandInput,
): ReviewApprovedMergeCommandVerdict {
  const evidence = baseEvidence(input);
  const warnings = [...input.review_intake.pending_reviewers.map((reviewer) => `pending reviewer ${reviewer}`), ...input.merge_readiness.warnings];

  if (!input.review_intake.ok || input.review_intake.action !== "route_to_merge_gate") {
    return block(
      "block_review_not_approved",
      evidence,
      [
        ...input.review_intake.blockers,
        `review response action is ${input.review_intake.action}, not route_to_merge_gate`,
      ],
      warnings,
      "wait for live-head approval or repair requested review changes before compiling a merge command",
    );
  }

  if (input.review_intake.head_sha !== input.live_head_sha) {
    return block(
      "block_stale_review_head",
      evidence,
      [`review response head ${input.review_intake.head_sha} is not live head ${input.live_head_sha}`],
      warnings,
      "discard stale review response intake and reread reviews from the live PR head",
    );
  }

  if (!input.merge_readiness.ok || input.merge_readiness.action !== "merge_ready") {
    return block(
      "block_merge_readiness_not_ready",
      evidence,
      [
        ...input.merge_readiness.blockers,
        `merge readiness action is ${input.merge_readiness.action}, not merge_ready`,
      ],
      warnings,
      "resolve merge readiness before compiling a review-approved merge command",
    );
  }

  if (input.merge_readiness.head_sha !== input.live_head_sha) {
    return block(
      "block_stale_readiness_head",
      evidence,
      [`merge readiness head ${input.merge_readiness.head_sha} is not live head ${input.live_head_sha}`],
      warnings,
      "refresh merge readiness against the live PR head before compiling a merge command",
    );
  }

  const commandVerdict: MergeFinalizationCommandVerdict = compileMergeFinalizationCommand({
    readiness: input.merge_readiness,
    live_head_sha: input.live_head_sha,
    command_id: input.command_id,
    spent_command_ids: input.spent_command_ids,
    external_boundary: input.external_boundary,
    merge_method: input.merge_method,
  });

  if (!commandVerdict.ok || !commandVerdict.command) {
    return block(
      "block_merge_command_compile",
      [...evidence, ...commandVerdict.decisive_evidence],
      commandVerdict.blockers,
      warnings,
      commandVerdict.next_route,
    );
  }

  return {
    ok: true,
    action: "compile_review_approved_merge_command",
    command: commandVerdict.command,
    decisive_evidence: [
      ...evidence,
      ...input.review_intake.approvals.map((reviewer) => `approved by ${reviewer}`),
      ...input.merge_readiness.decisive_evidence,
      ...commandVerdict.decisive_evidence,
    ],
    blockers: [],
    warnings,
    next_route: "execute the guarded GitHub merge command only while review intake, merge readiness, and live head still match",
  };
}
