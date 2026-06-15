import type { ReviewRequestCommand } from "./review-request-command.js";

export type ReviewRequestResultAction =
  | "compile_review_request_result_receipt"
  | "block_stale_command_head"
  | "block_target_drift"
  | "block_replayed_result_receipt"
  | "emit_review_request_external_blocker";

export interface ReviewRequestApiResult {
  ok: boolean;
  requested_reviewers: string[];
  requested_team_reviewers: string[];
  status_code?: number;
  error?: string;
}

export interface ReviewRequestResultReceiptInput {
  command: ReviewRequestCommand;
  live_head_sha: string;
  api_result: ReviewRequestApiResult;
  receipt_id: string;
  spent_receipt_ids: string[];
}

export interface ReviewRequestResultReceipt {
  ok: boolean;
  action: ReviewRequestResultAction;
  receipt_id: string | null;
  operation: "request_pull_request_reviewers";
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  reviewers: string[];
  team_reviewers: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function normalize(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function sameTargets(left: string[], right: string[]): boolean {
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);

  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((value, index) => value === normalizedRight[index])
  );
}

function block(
  input: ReviewRequestResultReceiptInput,
  action: Exclude<ReviewRequestResultAction, "compile_review_request_result_receipt">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ReviewRequestResultReceipt {
  return {
    ok: false,
    action,
    receipt_id: null,
    operation: "request_pull_request_reviewers",
    repository_full_name: input.command.repository_full_name,
    pr_number: input.command.pr_number,
    branch: input.command.branch,
    head_sha: input.command.head_sha,
    reviewers: [],
    team_reviewers: [],
    decisive_evidence: [
      `command ${input.command.command_id}`,
      `command head ${input.command.head_sha}`,
      `live head ${input.live_head_sha}`,
      ...evidence,
    ],
    blockers,
    next_route: nextRoute,
  };
}

export function compileReviewRequestResultReceipt(
  input: ReviewRequestResultReceiptInput,
): ReviewRequestResultReceipt {
  if (input.command.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_command_head",
      [`review request command head ${input.command.head_sha} is not live head ${input.live_head_sha}`],
      "refresh the review request command against the live PR head before reading its result",
    );
  }

  const receiptId = input.receipt_id.trim();
  if (!receiptId || input.spent_receipt_ids.includes(receiptId)) {
    return block(
      input,
      "block_replayed_result_receipt",
      [receiptId ? `review request result receipt already spent: ${receiptId}` : "review request result receipt has no id"],
      "compile each GitHub reviewer-request result with a new durable receipt id",
    );
  }

  const reviewers = normalize(input.api_result.requested_reviewers);
  const teamReviewers = normalize(input.api_result.requested_team_reviewers);

  if (!sameTargets(reviewers, input.command.reviewers) || !sameTargets(teamReviewers, input.command.team_reviewers)) {
    return block(
      input,
      "block_target_drift",
      ["GitHub review-request result targets do not match the admitted command targets"],
      "treat the review request result as unresolved until the command target set and GitHub result match exactly",
      [
        ...reviewers.map((reviewer) => `result reviewer:${reviewer}`),
        ...teamReviewers.map((team) => `result team:${team}`),
      ],
    );
  }

  if (!input.api_result.ok) {
    const status = input.api_result.status_code ? `status ${input.api_result.status_code}` : "unknown status";
    const error = input.api_result.error?.trim() || "GitHub did not accept the reviewer request";

    return block(
      input,
      "emit_review_request_external_blocker",
      [`${status}: ${error}`],
      "remove the GitHub reviewer-request blocker before claiming review handoff completion",
      [status, error],
    );
  }

  return {
    ok: true,
    action: "compile_review_request_result_receipt",
    receipt_id: receiptId,
    operation: "request_pull_request_reviewers",
    repository_full_name: input.command.repository_full_name,
    pr_number: input.command.pr_number,
    branch: input.command.branch,
    head_sha: input.command.head_sha,
    reviewers,
    team_reviewers: teamReviewers,
    decisive_evidence: [
      `command ${input.command.command_id}`,
      `receipt ${receiptId}`,
      `live head ${input.live_head_sha}`,
      ...reviewers.map((reviewer) => `reviewer:${reviewer}`),
      ...teamReviewers.map((team) => `team:${team}`),
    ],
    blockers: [],
    next_route: "record review-request completion only for this live head and receipt id, then wait for reviewer response or merge gate movement",
  };
}
