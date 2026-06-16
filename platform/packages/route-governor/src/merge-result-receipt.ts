import type { MergeCommand } from "./merge-command.js";

export type MergeResultReceiptAction =
  | "compile_merge_result_receipt"
  | "block_stale_command_head"
  | "block_replayed_result_receipt"
  | "block_unmerged_result"
  | "block_merge_sha_mismatch";

export interface MergeApiResult {
  ok: boolean;
  merged: boolean;
  merge_commit_sha?: string;
  status_code?: number;
  error?: string;
  head_sha?: string;
}

export interface MergeResultReceiptInput {
  command: MergeCommand;
  live_head_sha: string;
  api_result: MergeApiResult;
  receipt_id: string;
  spent_receipt_ids: string[];
}

export interface MergeResultReceipt {
  ok: boolean;
  action: MergeResultReceiptAction;
  receipt_id: string | null;
  operation: "merge_pull_request";
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  merge_method: string;
  merge_commit_sha: string | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function base(input: MergeResultReceiptInput): Pick<
  MergeResultReceipt,
  "operation" | "repository_full_name" | "pr_number" | "branch" | "head_sha" | "merge_method"
> {
  return {
    operation: "merge_pull_request",
    repository_full_name: input.command.repository_full_name,
    pr_number: input.command.pr_number,
    branch: input.command.branch,
    head_sha: input.command.expected_head_sha,
    merge_method: input.command.merge_method,
  };
}

function block(
  input: MergeResultReceiptInput,
  action: Exclude<MergeResultReceiptAction, "compile_merge_result_receipt">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): MergeResultReceipt {
  return {
    ...base(input),
    ok: false,
    action,
    receipt_id: null,
    merge_commit_sha: null,
    decisive_evidence: [
      `command ${input.command.command_id}`,
      `command head ${input.command.expected_head_sha}`,
      `live head ${input.live_head_sha}`,
      ...evidence,
    ],
    blockers,
    next_route: nextRoute,
  };
}

export function compileMergeResultReceipt(input: MergeResultReceiptInput): MergeResultReceipt {
  if (input.command.expected_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_command_head",
      [`merge command expected head ${input.command.expected_head_sha} is not live head ${input.live_head_sha}`],
      "discard the stale merge result and recompile merge command from the live PR head",
    );
  }

  const receiptId = input.receipt_id.trim();
  if (!receiptId || input.spent_receipt_ids.includes(receiptId)) {
    return block(
      input,
      "block_replayed_result_receipt",
      [receiptId ? `merge result receipt already spent: ${receiptId}` : "merge result receipt has no id"],
      "compile each GitHub merge result with a new durable receipt id",
    );
  }

  if (input.api_result.head_sha && input.api_result.head_sha !== input.command.expected_head_sha) {
    return block(
      input,
      "block_stale_command_head",
      [`GitHub merge result head ${input.api_result.head_sha} is not command head ${input.command.expected_head_sha}`],
      "treat the merge result as stale until GitHub reports the command head",
      [`result head ${input.api_result.head_sha}`],
    );
  }

  if (!input.api_result.ok || !input.api_result.merged) {
    const status = input.api_result.status_code ? `status ${input.api_result.status_code}` : "unknown status";
    const error = input.api_result.error?.trim() || "GitHub did not merge the pull request";

    return block(
      input,
      "block_unmerged_result",
      [`${status}: ${error}`],
      "remove the GitHub merge blocker before claiming merge completion",
      [status, error],
    );
  }

  const mergeSha = input.api_result.merge_commit_sha?.trim();
  if (!mergeSha) {
    return block(
      input,
      "block_merge_sha_mismatch",
      ["GitHub merge result did not include a merge commit SHA"],
      "read the merge result again or emit the exact missing-merge-sha blocker",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "compile_merge_result_receipt",
    receipt_id: receiptId,
    merge_commit_sha: mergeSha,
    decisive_evidence: [
      `command ${input.command.command_id}`,
      `receipt ${receiptId}`,
      `live head ${input.live_head_sha}`,
      `merge commit ${mergeSha}`,
      `merge method ${input.command.merge_method}`,
    ],
    blockers: [],
    next_route: "treat PR merge completion as receipted only for this live head and merge commit SHA",
  };
}
