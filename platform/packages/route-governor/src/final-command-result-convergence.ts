export type FinalCommandResultRequestedAction =
  | "request_final_review"
  | "merge_finalization"
  | "metadata_reread"
  | "duplicate_comment"
  | "warning_maintenance"
  | "command_echo";

export type FinalCommandResultKind = "review_request_result" | "merge_result";

export type FinalCommandResultConvergenceAction =
  | "converge_review_request_result"
  | "converge_merge_result"
  | "block_reused_convergence"
  | "block_non_progress_action"
  | "block_missing_result_receipt"
  | "block_ambiguous_result_receipts"
  | "block_branch_mismatch"
  | "block_head_mismatch"
  | "block_failed_result_receipt"
  | "block_missing_external_result_id"
  | "block_missing_merge_commit";

export interface FinalCommandResultReceipt {
  receipt_id: string;
  kind: FinalCommandResultKind;
  branch: string;
  head_sha: string;
  ok: boolean;
  external_result_id: string;
  evidence: string[];
  blockers: string[];
  warnings?: string[];
  merge_commit_sha?: string;
}

export interface FinalCommandResultConvergenceInput {
  active_branch: string;
  live_head_sha: string;
  convergence_id: string;
  spent_convergence_ids: string[];
  requested_action: FinalCommandResultRequestedAction;
  result_receipts: FinalCommandResultReceipt[];
}

export interface FinalCommandResultConvergenceVerdict {
  ok: boolean;
  action: FinalCommandResultConvergenceAction;
  convergence_id: string | null;
  branch: string;
  head_sha: string;
  admitted_receipt_ids: string[];
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

const NON_PROGRESS_ACTIONS = new Set<FinalCommandResultRequestedAction>([
  "metadata_reread",
  "duplicate_comment",
  "warning_maintenance",
  "command_echo",
]);

function requiredKind(action: FinalCommandResultRequestedAction): FinalCommandResultKind | null {
  switch (action) {
    case "request_final_review":
      return "review_request_result";
    case "merge_finalization":
      return "merge_result";
    default:
      return null;
  }
}

function base(input: FinalCommandResultConvergenceInput): Pick<
  FinalCommandResultConvergenceVerdict,
  "convergence_id" | "branch" | "head_sha"
> {
  return {
    convergence_id: input.convergence_id.trim() || null,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
  };
}

function receiptEvidence(receipt: FinalCommandResultReceipt): string[] {
  return [
    receipt.receipt_id,
    receipt.kind,
    `external result ${receipt.external_result_id || "<missing>"}`,
    ...receipt.evidence,
  ];
}

function warnings(input: FinalCommandResultConvergenceInput): string[] {
  return input.result_receipts.flatMap((receipt) => receipt.warnings ?? []);
}

function block(
  input: FinalCommandResultConvergenceInput,
  action: Exclude<
    FinalCommandResultConvergenceAction,
    "converge_review_request_result" | "converge_merge_result"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): FinalCommandResultConvergenceVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    admitted_receipt_ids: [],
    decisive_evidence: evidence,
    blockers,
    warnings: warnings(input),
    next_route: nextRoute,
  };
}

export function convergeFinalCommandResult(
  input: FinalCommandResultConvergenceInput,
): FinalCommandResultConvergenceVerdict {
  const convergenceId = input.convergence_id.trim();
  const routeEvidence = [`convergence ${convergenceId || "<missing>"}`, `live head ${input.live_head_sha}`];

  if (!convergenceId || input.spent_convergence_ids.includes(convergenceId)) {
    return block(
      input,
      "block_reused_convergence",
      [convergenceId ? `final command result convergence already spent: ${convergenceId}` : "final command result convergence has no id"],
      "issue a fresh convergence id before consuming final command results",
      routeEvidence,
    );
  }

  if (NON_PROGRESS_ACTIONS.has(input.requested_action)) {
    return block(
      input,
      "block_non_progress_action",
      [`${input.requested_action} cannot be converged as final command progress`],
      "consume a live GitHub review-request or merge result receipt instead of command echo, metadata reread, duplicate comment, or warning maintenance",
      [...routeEvidence, `requested action ${input.requested_action}`],
    );
  }

  const kind = requiredKind(input.requested_action);
  const matchingReceipts = input.result_receipts.filter((receipt) => receipt.kind === kind);

  if (matchingReceipts.length === 0) {
    return block(
      input,
      "block_missing_result_receipt",
      [`missing ${kind ?? "final command"} receipt for ${input.requested_action}`],
      "read the external GitHub command result before claiming final command completion",
      routeEvidence,
    );
  }

  if (matchingReceipts.length > 1) {
    return block(
      input,
      "block_ambiguous_result_receipts",
      [`multiple ${kind} receipts supplied for one final command convergence`],
      "converge exactly one external result receipt per final command",
      matchingReceipts.flatMap(receiptEvidence),
    );
  }

  const receipt = matchingReceipts[0];
  if (receipt.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`result receipt ${receipt.receipt_id} is on ${receipt.branch}, not ${input.active_branch}`],
      "discard off-branch final command results and read the active PR branch result",
      [...routeEvidence, ...receiptEvidence(receipt)],
    );
  }

  if (receipt.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_head_mismatch",
      [`result receipt ${receipt.receipt_id} belongs to ${receipt.head_sha}, not live head ${input.live_head_sha}`],
      "discard stale final command results and read the command result for the live PR head",
      [...routeEvidence, ...receiptEvidence(receipt)],
    );
  }

  if (!receipt.ok || receipt.blockers.length > 0) {
    return block(
      input,
      "block_failed_result_receipt",
      receipt.blockers.length > 0 ? receipt.blockers : [`result receipt ${receipt.receipt_id} is not admitted`],
      "remove the GitHub final command blocker before claiming command completion",
      [...routeEvidence, ...receiptEvidence(receipt)],
    );
  }

  const externalResultId = receipt.external_result_id.trim();
  if (!externalResultId) {
    return block(
      input,
      "block_missing_external_result_id",
      [`result receipt ${receipt.receipt_id} has no external result id`],
      "bind final command completion to a retrievable GitHub result id before release",
      [...routeEvidence, ...receiptEvidence(receipt)],
    );
  }

  if (input.requested_action === "merge_finalization" && !receipt.merge_commit_sha?.trim()) {
    return block(
      input,
      "block_missing_merge_commit",
      [`merge result receipt ${receipt.receipt_id} has no merge commit SHA`],
      "read the merge result until the merge commit SHA is bound or emit the exact missing-merge-sha blocker",
      [...routeEvidence, ...receiptEvidence(receipt)],
    );
  }

  if (input.requested_action === "merge_finalization") {
    return {
      ...base(input),
      ok: true,
      action: "converge_merge_result",
      admitted_receipt_ids: [receipt.receipt_id],
      decisive_evidence: [
        ...routeEvidence,
        ...receiptEvidence(receipt),
        `merge commit ${receipt.merge_commit_sha}`,
      ],
      blockers: [],
      warnings: receipt.warnings ?? [],
      next_route: "treat merge finalization as complete only for this live head, external result id, and merge commit SHA",
    };
  }

  return {
    ...base(input),
    ok: true,
    action: "converge_review_request_result",
    admitted_receipt_ids: [receipt.receipt_id],
    decisive_evidence: [...routeEvidence, ...receiptEvidence(receipt)],
    blockers: [],
    warnings: receipt.warnings ?? [],
    next_route: "treat final review request as receipted only for this live head and wait for reviewer response or a new merge authority route",
  };
}
