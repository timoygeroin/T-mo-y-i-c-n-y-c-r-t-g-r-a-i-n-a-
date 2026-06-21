import type { FinalReviewExecutionWindowVerdict } from "./final-review-execution-window.js";
import type { MergeResultReceipt } from "./merge-result-receipt.js";
import type { ReviewRequestResultReceipt } from "./review-request-result-receipt.js";

export type ExecutionWindowConsumedReceipt = ReviewRequestResultReceipt | MergeResultReceipt;

export type ExecutionWindowConsumptionAction =
  | "accept_execution_window_consumption"
  | "block_unopened_window"
  | "block_replayed_consumption"
  | "block_window_head_mismatch"
  | "block_receipt_head_mismatch"
  | "block_receipt_branch_mismatch"
  | "block_command_mismatch"
  | "block_failed_command_receipt";

export interface ExecutionWindowConsumptionInput {
  active_branch: string;
  live_head_sha: string;
  consumption_id: string;
  spent_consumption_ids: string[];
  window: FinalReviewExecutionWindowVerdict;
  receipt: ExecutionWindowConsumedReceipt;
}

export interface ExecutionWindowConsumptionVerdict {
  ok: boolean;
  action: ExecutionWindowConsumptionAction;
  consumption_id: string | null;
  branch: string;
  head_sha: string;
  operation: ExecutionWindowConsumedReceipt["operation"] | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function base(input: ExecutionWindowConsumptionInput): Pick<
  ExecutionWindowConsumptionVerdict,
  "consumption_id" | "branch" | "head_sha" | "operation"
> {
  return {
    consumption_id: input.consumption_id.trim() || null,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    operation: input.receipt.operation,
  };
}

function block(
  input: ExecutionWindowConsumptionInput,
  action: Exclude<ExecutionWindowConsumptionAction, "accept_execution_window_consumption">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ExecutionWindowConsumptionVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function expectedOperation(window: FinalReviewExecutionWindowVerdict): ExecutionWindowConsumedReceipt["operation"] | null {
  const command = window.decisive_evidence.find((item) => item.startsWith("command "))?.replace("command ", "");

  if (command === "request_final_review") return "request_pull_request_reviewers";
  if (command === "merge_finalization") return "merge_pull_request";
  return null;
}

function receiptEvidence(receipt: ExecutionWindowConsumedReceipt): string[] {
  return [
    `receipt ${receipt.receipt_id ?? "<missing>"}`,
    `operation ${receipt.operation}`,
    `receipt head ${receipt.head_sha}`,
    ...receipt.decisive_evidence,
  ];
}

export function consumeExecutionWindowReceipt(
  input: ExecutionWindowConsumptionInput,
): ExecutionWindowConsumptionVerdict {
  const consumptionId = input.consumption_id.trim();
  const evidence = [
    `consumption ${consumptionId || "<missing>"}`,
    `window ${input.window.window_id ?? "<missing>"}`,
    `live head ${input.live_head_sha}`,
    ...receiptEvidence(input.receipt),
  ];

  if (!consumptionId || input.spent_consumption_ids.includes(consumptionId)) {
    return block(
      input,
      "block_replayed_consumption",
      [consumptionId ? `execution window consumption already spent: ${consumptionId}` : "execution window consumption has no id"],
      "issue a fresh consumption id for each external command result",
      evidence,
    );
  }

  if (!input.window.ok || input.window.action !== "execute_final_review_command") {
    return block(
      input,
      "block_unopened_window",
      ["execution window did not admit a final review command"],
      "open a live-head final review execution window before consuming a command result",
      [...evidence, ...input.window.blockers],
    );
  }

  if (input.window.branch !== input.active_branch || input.receipt.branch !== input.active_branch) {
    return block(
      input,
      "block_receipt_branch_mismatch",
      [`window or receipt is not bound to active branch ${input.active_branch}`],
      "discard cross-branch command receipts before final review execution can be consumed",
      evidence,
    );
  }

  if (input.window.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_window_head_mismatch",
      [`execution window head ${input.window.head_sha} is not live head ${input.live_head_sha}`],
      "rebuild the execution window from the current PR head before consuming command results",
      evidence,
    );
  }

  if (input.receipt.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_receipt_head_mismatch",
      [`command receipt head ${input.receipt.head_sha} is not live head ${input.live_head_sha}`],
      "discard stale command receipts and execute against the current PR head",
      evidence,
    );
  }

  const operation = expectedOperation(input.window);
  if (!operation || operation !== input.receipt.operation) {
    return block(
      input,
      "block_command_mismatch",
      [`window command expects ${operation ?? "<unknown>"}, but receipt is ${input.receipt.operation}`],
      "consume only the GitHub operation admitted by the single-use execution window",
      evidence,
    );
  }

  if (!input.receipt.ok || input.receipt.blockers.length > 0) {
    return block(
      input,
      "block_failed_command_receipt",
      input.receipt.blockers.length > 0 ? input.receipt.blockers : ["command receipt did not complete"],
      "remove the external command blocker before marking the execution window consumed",
      evidence,
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "accept_execution_window_consumption",
    decisive_evidence: [
      `consumption ${consumptionId}`,
      `window ${input.window.window_id}`,
      `operation ${input.receipt.operation}`,
      `head ${input.live_head_sha}`,
      ...input.window.decisive_evidence,
      ...input.receipt.decisive_evidence,
    ],
    blockers: [],
    next_route:
      input.receipt.operation === "merge_pull_request"
        ? "treat merge execution as consumed only for this head and merge receipt"
        : "wait for live-head review feedback or route the exact review-request blocker",
  };
}
