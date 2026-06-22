export type FinalReviewCommandConsumptionCommand =
  | "request_final_review"
  | "merge_finalization"
  | "exact_external_blocker"
  | "metadata_reread"
  | "duplicate_comment"
  | "warning_maintenance";

export type FinalReviewCommandConsumptionAction =
  | "consume_final_review_command"
  | "emit_exact_external_blocker"
  | "block_invalid_authority"
  | "block_branch_mismatch"
  | "block_head_mismatch"
  | "block_command_mismatch"
  | "block_reused_receipt"
  | "block_non_progress_command"
  | "block_active_external_blocker"
  | "block_missing_external_operation"
  | "block_missing_exact_blocker";

export interface FinalReviewCommandAuthority {
  authority_id: string;
  branch: string;
  head_sha: string;
  command: Extract<FinalReviewCommandConsumptionCommand, "request_final_review" | "merge_finalization">;
  ok: boolean;
  evidence: string[];
  blockers: string[];
  warnings?: string[];
}

export interface FinalReviewCommandConsumptionInput {
  active_branch: string;
  live_head_sha: string;
  command: FinalReviewCommandConsumptionCommand;
  authority: FinalReviewCommandAuthority;
  receipt_id: string;
  spent_receipt_ids: string[];
  active_external_blockers: string[];
  external_operation_id?: string;
  external_operation_url?: string;
  exact_blocker?: string;
}

export interface FinalReviewCommandConsumptionVerdict {
  ok: boolean;
  action: FinalReviewCommandConsumptionAction;
  receipt_id: string | null;
  branch: string;
  head_sha: string;
  consumed_authority_id: string | null;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

const NON_PROGRESS_COMMANDS = new Set<FinalReviewCommandConsumptionCommand>([
  "metadata_reread",
  "duplicate_comment",
  "warning_maintenance",
]);

function base(input: FinalReviewCommandConsumptionInput): Pick<
  FinalReviewCommandConsumptionVerdict,
  "receipt_id" | "branch" | "head_sha"
> {
  return {
    receipt_id: input.receipt_id.trim() || null,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
  };
}

function authorityWarnings(input: FinalReviewCommandConsumptionInput): string[] {
  return input.authority.warnings ?? [];
}

function authorityEvidence(input: FinalReviewCommandConsumptionInput): string[] {
  return [
    `authority ${input.authority.authority_id || "<missing>"}`,
    `authority command ${input.authority.command}`,
    ...input.authority.evidence,
  ];
}

function block(
  input: FinalReviewCommandConsumptionInput,
  action: Exclude<
    FinalReviewCommandConsumptionAction,
    "consume_final_review_command" | "emit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): FinalReviewCommandConsumptionVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    consumed_authority_id: null,
    decisive_evidence: evidence,
    blockers,
    warnings: authorityWarnings(input),
    next_route: nextRoute,
  };
}

export function consumeFinalReviewCommand(
  input: FinalReviewCommandConsumptionInput,
): FinalReviewCommandConsumptionVerdict {
  const receiptId = input.receipt_id.trim();
  const operationId = input.external_operation_id?.trim();
  const operationUrl = input.external_operation_url?.trim();
  const routeEvidence = [`receipt ${receiptId || "<missing>"}`, `live head ${input.live_head_sha}`];

  if (NON_PROGRESS_COMMANDS.has(input.command)) {
    return block(
      input,
      "block_non_progress_command",
      [`${input.command} cannot consume final review command authority as progress`],
      "choose final review request, merge finalization, or one exact external blocker",
      routeEvidence,
    );
  }

  if (input.command === "exact_external_blocker") {
    const blocker = input.exact_blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_missing_exact_blocker",
        ["final review command exact-blocker path has no blocker text"],
        "name the exact external blocker or consume a valid live-head command authority",
        routeEvidence,
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_exact_external_blocker",
      consumed_authority_id: null,
      decisive_evidence: [...routeEvidence, blocker],
      blockers: [blocker],
      warnings: authorityWarnings(input),
      next_route: "remove the named blocker before consuming final review command authority",
    };
  }

  if (!input.authority.ok || input.authority.blockers.length > 0 || !input.authority.authority_id.trim()) {
    return block(
      input,
      "block_invalid_authority",
      input.authority.blockers.length > 0
        ? input.authority.blockers
        : ["final review command authority is not admitted"],
      "rebuild admitted authority before executing a final review command",
      [...routeEvidence, ...authorityEvidence(input)],
    );
  }

  if (input.authority.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`authority ${input.authority.authority_id} is on ${input.authority.branch}, not ${input.active_branch}`],
      "consume only authority bound to the active PR branch",
      [...routeEvidence, ...authorityEvidence(input)],
    );
  }

  if (input.authority.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_head_mismatch",
      [`authority ${input.authority.authority_id} belongs to ${input.authority.head_sha}, not live head ${input.live_head_sha}`],
      "refresh final review command authority against the live PR head",
      [...routeEvidence, ...authorityEvidence(input)],
    );
  }

  if (input.authority.command !== input.command) {
    return block(
      input,
      "block_command_mismatch",
      [`authority ${input.authority.authority_id} admits ${input.authority.command}, not ${input.command}`],
      "execute only the command admitted by the live-head authority",
      [...routeEvidence, ...authorityEvidence(input)],
    );
  }

  if (!receiptId || input.spent_receipt_ids.includes(receiptId)) {
    return block(
      input,
      "block_reused_receipt",
      [receiptId ? `final review command receipt already spent: ${receiptId}` : "final review command receipt has no id"],
      "issue a fresh single-use receipt before consuming command authority",
      routeEvidence,
    );
  }

  if (input.active_external_blockers.length > 0) {
    return block(
      input,
      "block_active_external_blocker",
      input.active_external_blockers,
      "retire active external blockers before consuming final review command authority",
      routeEvidence,
    );
  }

  if (!operationId) {
    return block(
      input,
      "block_missing_external_operation",
      ["final review command consumption has no external operation id"],
      "attach the GitHub review-request or merge operation id before counting command consumption",
      routeEvidence,
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "consume_final_review_command",
    consumed_authority_id: input.authority.authority_id,
    decisive_evidence: [
      ...routeEvidence,
      ...authorityEvidence(input),
      `operation ${operationId}`,
      ...(operationUrl ? [operationUrl] : []),
    ],
    blockers: [],
    warnings: authorityWarnings(input),
    next_route:
      "treat this command authority as spent; any branch, review, merge, or status change after the operation requires a fresh live-head readback",
  };
}
