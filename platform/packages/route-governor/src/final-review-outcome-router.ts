export type FinalReviewOutcomeCommand = "request_final_review" | "merge_finalization";

export type FinalReviewOutcomeKind =
  | "review_requested"
  | "review_request_failed"
  | "merged"
  | "merge_failed"
  | "head_moved"
  | "no_external_result";

export type FinalReviewOutcomeAction =
  | "await_review_feedback"
  | "seal_merge_completion"
  | "route_to_exact_external_blocker"
  | "route_to_moved_head_status"
  | "block_reused_outcome"
  | "block_branch_mismatch"
  | "block_head_mismatch"
  | "block_command_mismatch"
  | "block_missing_result_evidence";

export interface FinalReviewOutcomeSurface {
  outcome_id: string;
  branch: string;
  head_sha: string;
  command: FinalReviewOutcomeCommand;
  kind: FinalReviewOutcomeKind;
  evidence: string[];
  blockers: string[];
  next_head_sha?: string;
}

export interface FinalReviewOutcomeRouterInput {
  active_branch: string;
  live_head_sha: string;
  expected_command: FinalReviewOutcomeCommand;
  spent_outcome_ids: string[];
  outcome: FinalReviewOutcomeSurface;
}

export interface FinalReviewOutcomeRouterVerdict {
  ok: boolean;
  action: FinalReviewOutcomeAction;
  outcome_id: string | null;
  branch: string;
  head_sha: string;
  command: FinalReviewOutcomeCommand;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function base(input: FinalReviewOutcomeRouterInput): Pick<
  FinalReviewOutcomeRouterVerdict,
  "outcome_id" | "branch" | "head_sha" | "command"
> {
  return {
    outcome_id: input.outcome.outcome_id.trim() || null,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    command: input.expected_command,
  };
}

function routeEvidence(input: FinalReviewOutcomeRouterInput): string[] {
  return [
    `outcome ${input.outcome.outcome_id.trim() || "<missing>"}`,
    `kind ${input.outcome.kind}`,
    `command ${input.outcome.command}`,
    `live head ${input.live_head_sha}`,
    ...input.outcome.evidence,
  ];
}

function block(
  input: FinalReviewOutcomeRouterInput,
  action: Exclude<
    FinalReviewOutcomeAction,
    "await_review_feedback" | "seal_merge_completion" | "route_to_exact_external_blocker" | "route_to_moved_head_status"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): FinalReviewOutcomeRouterVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

export function routeFinalReviewOutcome(input: FinalReviewOutcomeRouterInput): FinalReviewOutcomeRouterVerdict {
  const outcomeId = input.outcome.outcome_id.trim();
  const evidence = routeEvidence(input);

  if (!outcomeId || input.spent_outcome_ids.includes(outcomeId)) {
    return block(
      input,
      "block_reused_outcome",
      [outcomeId ? `final review outcome already spent: ${outcomeId}` : "final review outcome has no id"],
      "capture a fresh downstream review or merge result before routing the next finalization step",
      evidence,
    );
  }

  if (input.outcome.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`outcome ${outcomeId} is on ${input.outcome.branch}, not ${input.active_branch}`],
      "discard cross-branch final review outcomes before finalization routing",
      evidence,
    );
  }

  if (input.outcome.command !== input.expected_command) {
    return block(
      input,
      "block_command_mismatch",
      [`outcome ${outcomeId} records ${input.outcome.command}, not ${input.expected_command}`],
      "route only the result of the command admitted by final-review authority",
      evidence,
    );
  }

  if (input.outcome.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_head_mismatch",
      [`outcome ${outcomeId} belongs to ${input.outcome.head_sha}, not live head ${input.live_head_sha}`],
      "re-read downstream final-review results for the live PR head before routing",
      evidence,
    );
  }

  if (input.outcome.evidence.length === 0) {
    return block(
      input,
      "block_missing_result_evidence",
      [`outcome ${outcomeId} has no external result evidence`],
      "attach the concrete review-request or merge result receipt before claiming progress",
      evidence,
    );
  }

  if (input.outcome.kind === "review_requested") {
    if (input.expected_command !== "request_final_review") {
      return block(
        input,
        "block_command_mismatch",
        ["review-request outcome cannot satisfy merge-finalization authority"],
        "consume review-request outcomes only after request-final-review authority",
        evidence,
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "await_review_feedback",
      decisive_evidence: evidence,
      blockers: [],
      next_route: "wait for live-head review feedback; route changes_requested to bounded repair and approvals to merge gate",
    };
  }

  if (input.outcome.kind === "merged") {
    if (input.expected_command !== "merge_finalization") {
      return block(
        input,
        "block_command_mismatch",
        ["merge outcome cannot satisfy final-review-request authority"],
        "consume merge outcomes only after merge-finalization authority",
        evidence,
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "seal_merge_completion",
      decisive_evidence: evidence,
      blockers: [],
      next_route: "seal the merged manifestation receipt and stop adding PR-branch embodiment increments",
    };
  }

  if (input.outcome.kind === "head_moved") {
    const nextHead = input.outcome.next_head_sha?.trim();
    if (!nextHead) {
      return block(
        input,
        "block_missing_result_evidence",
        [`outcome ${outcomeId} says the head moved but provides no next head sha`],
        "capture the moved PR head before status or review routing",
        evidence,
      );
    }

    return {
      ...base(input),
      ok: false,
      action: "route_to_moved_head_status",
      decisive_evidence: [...evidence, `next head ${nextHead}`],
      blockers: [`fresh status/readback required for moved head ${nextHead}`],
      next_route: "obtain current-head status for the moved branch before consuming review or merge authority again",
    };
  }

  const blockerText = input.outcome.blockers.length > 0
    ? input.outcome.blockers
    : [`${input.outcome.kind} reported for ${input.expected_command}`];

  return {
    ...base(input),
    ok: false,
    action: "route_to_exact_external_blocker",
    decisive_evidence: evidence,
    blockers: blockerText,
    next_route: "remove the exact downstream final-review blocker before another finalization command",
  };
}
