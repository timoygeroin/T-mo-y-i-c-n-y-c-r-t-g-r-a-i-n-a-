export type FinalReviewAuthorityConsumptionCommand =
  | "request_final_review"
  | "merge_finalization"
  | "exact_external_blocker";

export type FinalReviewAuthorityConsumptionAction =
  | "accept_authority_consumption"
  | "emit_exact_external_blocker"
  | "block_reused_consumption"
  | "block_wrong_branch"
  | "block_wrong_head"
  | "block_bundle_mismatch"
  | "block_command_mismatch"
  | "block_missing_result_receipt"
  | "block_failed_result_receipt"
  | "block_missing_exact_blocker";

export interface FinalReviewAuthorityConsumptionBundle {
  bundle_id: string;
  branch: string;
  head_sha: string;
  command: FinalReviewAuthorityConsumptionCommand;
  ok: boolean;
  blockers: string[];
  evidence: string[];
}

export interface FinalReviewAuthorityResultReceipt {
  receipt_id: string;
  branch: string;
  head_sha: string;
  command: FinalReviewAuthorityConsumptionCommand;
  ok: boolean;
  evidence: string[];
  blockers: string[];
}

export interface FinalReviewAuthorityConsumptionInput {
  active_branch: string;
  live_head_sha: string;
  consumption_id: string;
  spent_consumption_ids: string[];
  bundle: FinalReviewAuthorityConsumptionBundle;
  command: FinalReviewAuthorityConsumptionCommand;
  result_receipt?: FinalReviewAuthorityResultReceipt;
  exact_blocker?: string;
}

export interface FinalReviewAuthorityConsumptionVerdict {
  ok: boolean;
  action: FinalReviewAuthorityConsumptionAction;
  consumption_id: string | null;
  bundle_id: string;
  branch: string;
  head_sha: string;
  command: FinalReviewAuthorityConsumptionCommand;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function base(input: FinalReviewAuthorityConsumptionInput): Pick<
  FinalReviewAuthorityConsumptionVerdict,
  "consumption_id" | "bundle_id" | "branch" | "head_sha" | "command"
> {
  return {
    consumption_id: input.consumption_id.trim() || null,
    bundle_id: input.bundle.bundle_id,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    command: input.command,
  };
}

function routeEvidence(input: FinalReviewAuthorityConsumptionInput): string[] {
  return [
    `consumption ${input.consumption_id.trim() || "<missing>"}`,
    `bundle ${input.bundle.bundle_id}`,
    `live head ${input.live_head_sha}`,
    `command ${input.command}`,
  ];
}

function block(
  input: FinalReviewAuthorityConsumptionInput,
  action: Exclude<
    FinalReviewAuthorityConsumptionAction,
    "accept_authority_consumption" | "emit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): FinalReviewAuthorityConsumptionVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

export function consumeFinalReviewAuthority(
  input: FinalReviewAuthorityConsumptionInput,
): FinalReviewAuthorityConsumptionVerdict {
  const consumptionId = input.consumption_id.trim();
  const evidence = routeEvidence(input);

  if (!consumptionId || input.spent_consumption_ids.includes(consumptionId)) {
    return block(
      input,
      "block_reused_consumption",
      [consumptionId ? `final review authority consumption already spent: ${consumptionId}` : "final review authority consumption has no id"],
      "issue one fresh consumption id for exactly one final-review authority command",
      evidence,
    );
  }

  if (input.bundle.branch !== input.active_branch) {
    return block(
      input,
      "block_wrong_branch",
      [`authority bundle ${input.bundle.bundle_id} is on ${input.bundle.branch}, not ${input.active_branch}`],
      "rebuild authority consumption from the active PR branch",
      [...evidence, ...input.bundle.evidence],
    );
  }

  if (input.bundle.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_wrong_head",
      [`authority bundle ${input.bundle.bundle_id} belongs to ${input.bundle.head_sha}, not live head ${input.live_head_sha}`],
      "discard stale final-review authority and rebuild from the live PR head",
      [...evidence, ...input.bundle.evidence],
    );
  }

  if (!input.bundle.ok || input.bundle.blockers.length > 0) {
    return block(
      input,
      "block_bundle_mismatch",
      input.bundle.blockers.length > 0 ? input.bundle.blockers : [`authority bundle ${input.bundle.bundle_id} is not admitted`],
      "open a valid final-review authority bundle before consuming it",
      [...evidence, ...input.bundle.evidence],
    );
  }

  if (input.bundle.command !== input.command) {
    return block(
      input,
      "block_command_mismatch",
      [`authority bundle permits ${input.bundle.command}, not ${input.command}`],
      "consume final-review authority only through the command admitted by the bundle",
      [...evidence, ...input.bundle.evidence],
    );
  }

  if (input.command === "exact_external_blocker") {
    const blocker = input.exact_blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_missing_exact_blocker",
        ["authority consumption exact-blocker command has no blocker text"],
        "name the exact external blocker before consuming exact-blocker authority",
        evidence,
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_exact_external_blocker",
      decisive_evidence: [...evidence, blocker],
      blockers: [blocker],
      next_route: "remove the named blocker before attempting another final-review authority consumption",
    };
  }

  const receipt = input.result_receipt;
  if (!receipt) {
    return block(
      input,
      "block_missing_result_receipt",
      [`${input.command} authority consumption has no result receipt`],
      "attach the matching review or merge result receipt before consuming final-review authority",
      evidence,
    );
  }

  if (receipt.branch !== input.active_branch) {
    return block(
      input,
      "block_wrong_branch",
      [`result receipt ${receipt.receipt_id} is on ${receipt.branch}, not ${input.active_branch}`],
      "consume authority only with active-branch result receipts",
      [...evidence, ...receipt.evidence],
    );
  }

  if (receipt.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_wrong_head",
      [`result receipt ${receipt.receipt_id} belongs to ${receipt.head_sha}, not live head ${input.live_head_sha}`],
      "discard stale result receipts and rerun the command against the live PR head",
      [...evidence, ...receipt.evidence],
    );
  }

  if (receipt.command !== input.command) {
    return block(
      input,
      "block_command_mismatch",
      [`result receipt ${receipt.receipt_id} records ${receipt.command}, not ${input.command}`],
      "match final-review authority consumption to the same downstream command receipt",
      [...evidence, ...receipt.evidence],
    );
  }

  if (!receipt.ok || receipt.blockers.length > 0) {
    return block(
      input,
      "block_failed_result_receipt",
      receipt.blockers.length > 0 ? receipt.blockers : [`result receipt ${receipt.receipt_id} is not admitted`],
      "repair the downstream command result before consuming final-review authority",
      [...evidence, ...receipt.evidence],
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "accept_authority_consumption",
    decisive_evidence: [
      ...evidence,
      ...input.bundle.evidence,
      receipt.receipt_id,
      ...receipt.evidence,
    ],
    blockers: [],
    next_route: "seal this consumption id and block any second use of the same final-review authority bundle",
  };
}
