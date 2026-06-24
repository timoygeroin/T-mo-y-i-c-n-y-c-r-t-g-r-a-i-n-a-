import type { CurrentHeadTerminalOperation } from "./current-head-terminal-lease.js";

export type TerminalOperationResultOutcome = "succeeded" | "failed" | "blocked" | "not_attempted";

export type TerminalOperationFollowupClass =
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "external_platform_embodiment"
  | "merge_result_repair"
  | "review_result_repair";

export type TerminalOperationResultReceiptAction =
  | "accept_terminal_result_receipt"
  | "route_terminal_result_repair"
  | "block_branch_mismatch"
  | "block_stale_head"
  | "block_unknown_lease"
  | "block_reused_receipt"
  | "block_operation_mismatch"
  | "block_missing_result_evidence"
  | "block_bundled_followup";

export interface TerminalOperationResultReceiptInput {
  active_branch: string;
  live_head_sha: string;
  issued_lease_ids: string[];
  spent_result_receipt_ids: string[];
  receipt_id: string;
  lease_id: string;
  branch: string;
  head_sha: string;
  leased_operation: CurrentHeadTerminalOperation;
  completed_operation: CurrentHeadTerminalOperation;
  outcome: TerminalOperationResultOutcome;
  result_evidence: string[];
  blockers: string[];
  followup_move_classes: TerminalOperationFollowupClass[];
}

export interface TerminalOperationResultReceiptVerdict {
  ok: boolean;
  action: TerminalOperationResultReceiptAction;
  branch: string;
  head_sha: string;
  receipt_id: string | null;
  lease_id: string | null;
  operation: CurrentHeadTerminalOperation | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function base(input: TerminalOperationResultReceiptInput): Pick<
  TerminalOperationResultReceiptVerdict,
  "branch" | "head_sha" | "receipt_id" | "lease_id" | "operation"
> {
  return {
    branch: input.branch,
    head_sha: input.head_sha,
    receipt_id: input.receipt_id.trim() || null,
    lease_id: input.lease_id.trim() || null,
    operation: input.completed_operation,
  };
}

function block(
  input: TerminalOperationResultReceiptInput,
  action: Exclude<TerminalOperationResultReceiptAction, "accept_terminal_result_receipt" | "route_terminal_result_repair">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): TerminalOperationResultReceiptVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function resultEvidence(input: TerminalOperationResultReceiptInput): string[] {
  return [
    `receipt ${input.receipt_id.trim()}`,
    `lease ${input.lease_id.trim()}`,
    `operation ${input.completed_operation}`,
    `outcome ${input.outcome}`,
    `head ${input.head_sha}`,
    ...input.result_evidence,
    ...input.blockers,
    ...input.followup_move_classes.map((move) => `followup ${move}`),
  ];
}

function successfulNextRoute(operation: CurrentHeadTerminalOperation): string {
  if (operation === "merge_live_head") {
    return "record the merge result and stop scheduled embodiment claims until a new external sink exists";
  }
  if (operation === "request_review") {
    return "wait for review response or a new live-head signal before another terminal lease";
  }
  if (operation === "commit_external_embodiment") {
    return "bind the next status readback to the moved post-embodiment head";
  }
  return "preserve the exact blocker as terminal until the named blocker is removed";
}

function repairNextRoute(operation: CurrentHeadTerminalOperation): string {
  if (operation === "merge_live_head") return "repair only the concrete merge-result blocker before another merge lease";
  if (operation === "request_review") return "repair only the concrete review-result blocker before another review lease";
  if (operation === "commit_external_embodiment") {
    return "repair the concrete embodiment write blocker or emit the exact external blocker";
  }
  return "remove the named exact blocker before issuing another terminal result receipt";
}

export function compileTerminalOperationResultReceipt(
  input: TerminalOperationResultReceiptInput,
): TerminalOperationResultReceiptVerdict {
  if (input.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`terminal result branch ${input.branch} does not match active branch ${input.active_branch}`],
      "bind terminal result receipts to the active PR branch",
    );
  }

  if (input.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_head",
      [`terminal result head ${input.head_sha} is not live head ${input.live_head_sha}`],
      "discard stale terminal result receipts and reread the live PR head",
    );
  }

  const receiptId = input.receipt_id.trim();
  if (!receiptId || input.spent_result_receipt_ids.includes(receiptId)) {
    return block(
      input,
      "block_reused_receipt",
      [receiptId ? `terminal result receipt already spent: ${receiptId}` : "terminal result receipt has no id"],
      "issue one fresh terminal result receipt id for this lease outcome",
    );
  }

  const leaseId = input.lease_id.trim();
  if (!leaseId || !input.issued_lease_ids.includes(leaseId)) {
    return block(
      input,
      "block_unknown_lease",
      [leaseId ? `terminal result references unknown lease: ${leaseId}` : "terminal result has no lease id"],
      "compile a current-head terminal lease before accepting its result receipt",
    );
  }

  if (input.completed_operation !== input.leased_operation) {
    return block(
      input,
      "block_operation_mismatch",
      [`terminal result completed ${input.completed_operation} but lease admitted ${input.leased_operation}`],
      "consume each current-head terminal lease with exactly the operation it admitted",
    );
  }

  if (input.followup_move_classes.length > 1) {
    return block(
      input,
      "block_bundled_followup",
      [`terminal result bundles ${input.followup_move_classes.length} followup move classes`],
      "release one terminal result and choose at most one next route class",
      resultEvidence(input),
    );
  }

  const hasEvidence = input.result_evidence.some((item) => item.trim());
  const hasBlocker = input.blockers.some((item) => item.trim());

  if ((input.outcome === "succeeded" || input.outcome === "not_attempted") && !hasEvidence) {
    return block(
      input,
      "block_missing_result_evidence",
      [`terminal result ${input.outcome} has no result evidence`],
      "attach the external result evidence before accepting the terminal receipt",
    );
  }

  if ((input.outcome === "failed" || input.outcome === "blocked") && !hasBlocker) {
    return block(
      input,
      "block_missing_result_evidence",
      [`terminal result ${input.outcome} has no concrete blocker`],
      "name the concrete terminal result blocker before claiming repair direction",
    );
  }

  if (input.outcome === "failed" || input.outcome === "blocked") {
    return {
      ...base(input),
      ok: false,
      action: "route_terminal_result_repair",
      decisive_evidence: resultEvidence(input),
      blockers: input.blockers,
      next_route: repairNextRoute(input.completed_operation),
    };
  }

  return {
    ...base(input),
    ok: true,
    action: "accept_terminal_result_receipt",
    decisive_evidence: resultEvidence(input),
    blockers: [],
    next_route: successfulNextRoute(input.completed_operation),
  };
}
