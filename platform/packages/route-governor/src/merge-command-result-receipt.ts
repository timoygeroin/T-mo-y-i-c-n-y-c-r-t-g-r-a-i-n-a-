import type { MergeCommand } from "./merge-command-admission.js";

export type MergeResultReceiptAction =
  | "compile_merge_result_receipt"
  | "route_to_post_merge_closeout"
  | "block_stale_merge_command"
  | "block_replayed_merge_result"
  | "block_merge_head_moved"
  | "emit_merge_external_blocker";

export interface MergeApiResult {
  ok: boolean;
  merged: boolean;
  merge_commit_sha?: string;
  message?: string;
  status_code?: number;
  observed_head_sha?: string;
  error?: string;
}

export interface MergeCommandResultReceiptInput {
  command: MergeCommand;
  live_head_sha: string;
  api_result: MergeApiResult;
  receipt_id: string;
  spent_receipt_ids: string[];
}

export interface MergeCommandResultReceipt {
  ok: boolean;
  action: MergeResultReceiptAction;
  receipt_id: string | null;
  operation: "merge_pull_request";
  repository_full_name: string;
  pr_number: number;
  branch: string;
  expected_head_sha: string;
  merge_commit_sha: string | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function base(
  input: MergeCommandResultReceiptInput,
): Pick<
  MergeCommandResultReceipt,
  "operation" | "repository_full_name" | "pr_number" | "branch" | "expected_head_sha"
> {
  return {
    operation: "merge_pull_request",
    repository_full_name: input.command.repository_full_name,
    pr_number: input.command.pr_number,
    branch: input.command.branch,
    expected_head_sha: input.command.expected_head_sha,
  };
}

function block(
  input: MergeCommandResultReceiptInput,
  action: Exclude<MergeResultReceiptAction, "compile_merge_result_receipt" | "route_to_post_merge_closeout">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): MergeCommandResultReceipt {
  return {
    ...base(input),
    ok: false,
    action,
    receipt_id: null,
    merge_commit_sha: null,
    decisive_evidence: [
      `command ${input.command.command_id}`,
      `expected head ${input.command.expected_head_sha}`,
      `live head ${input.live_head_sha}`,
      ...evidence,
    ],
    blockers,
    next_route: nextRoute,
  };
}

function resultMessage(input: MergeCommandResultReceiptInput): string {
  return input.api_result.error?.trim() || input.api_result.message?.trim() || "GitHub merge API did not merge the pull request";
}

function statusLabel(input: MergeCommandResultReceiptInput): string {
  return input.api_result.status_code ? `status ${input.api_result.status_code}` : "unknown status";
}

function headMovedByResult(input: MergeCommandResultReceiptInput): boolean {
  const observed = input.api_result.observed_head_sha?.trim();
  return Boolean(observed && observed !== input.command.expected_head_sha);
}

export function compileMergeCommandResultReceipt(
  input: MergeCommandResultReceiptInput,
): MergeCommandResultReceipt {
  if (input.command.expected_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_merge_command",
      [`merge command expected head ${input.command.expected_head_sha} is not live head ${input.live_head_sha}`],
      "refresh merge readiness and compile a new merge command against the live PR head",
    );
  }

  const receiptId = input.receipt_id.trim();
  if (!receiptId || input.spent_receipt_ids.includes(receiptId)) {
    return block(
      input,
      "block_replayed_merge_result",
      [receiptId ? `merge result receipt already spent: ${receiptId}` : "merge result receipt has no id"],
      "compile each GitHub merge result with a new durable receipt id",
    );
  }

  if (headMovedByResult(input)) {
    return block(
      input,
      "block_merge_head_moved",
      [`GitHub observed head ${input.api_result.observed_head_sha}, not expected head ${input.command.expected_head_sha}`],
      "discard the merge result and re-enter from the moved live PR head before any merge claim",
      [`observed head ${input.api_result.observed_head_sha}`],
    );
  }

  if (!input.api_result.ok || !input.api_result.merged) {
    const status = statusLabel(input);
    const message = resultMessage(input);

    return block(
      input,
      "emit_merge_external_blocker",
      [`${status}: ${message}`],
      "remove the GitHub merge blocker before claiming post-merge closeout",
      [status, message],
    );
  }

  const mergeCommitSha = input.api_result.merge_commit_sha?.trim();
  if (!mergeCommitSha) {
    return block(
      input,
      "emit_merge_external_blocker",
      ["GitHub reported merged without a merge commit sha"],
      "read the GitHub merge result again before post-merge closeout",
      ["missing merge commit sha"],
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "compile_merge_result_receipt",
    receipt_id: receiptId,
    merge_commit_sha: mergeCommitSha,
    decisive_evidence: [
      `command ${input.command.command_id}`,
      `receipt ${receiptId}`,
      `expected head ${input.command.expected_head_sha}`,
      `merge commit ${mergeCommitSha}`,
      `merge method ${input.command.merge_method}`,
    ],
    blockers: [],
    next_route: "route to post-merge closeout; do not add another embodiment or status readback for the merged PR head",
  };
}
