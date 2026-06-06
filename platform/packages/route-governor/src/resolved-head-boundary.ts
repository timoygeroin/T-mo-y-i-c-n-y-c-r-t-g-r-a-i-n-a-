export type ResolvedHeadMoveClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "reopen_repaired_head_status_blocker"
  | "repair_new_current_head_failure"
  | "exact_external_blocker";

export type ResolvedHeadBoundaryAction =
  | "continue_external_embodiment"
  | "read_fresh_status"
  | "repair_new_current_head_failure"
  | "emit_exact_external_blocker"
  | "block_repaired_head_reopen";

export interface HeadBoundRunEvidence {
  id: string;
  head_sha: string;
  conclusion: "success" | "neutral" | "skipped" | "failure" | "timed_out" | "cancelled" | "action_required" | null;
}

export interface ResolvedHeadBoundaryInput {
  resolved_head_sha: string;
  current_head_sha: string;
  required_successful_run_ids: string[];
  surfaced_runs: HeadBoundRunEvidence[];
  blocker_issue_state: "open" | "closed";
  pr_is_draft: boolean;
  proposed_move_class: ResolvedHeadMoveClass;
  notices: string[];
  explicit_blocker?: string;
}

export interface ResolvedHeadBoundaryVerdict {
  ok: boolean;
  action: ResolvedHeadBoundaryAction;
  reason: string;
  resolved_boundary_survives: boolean;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
}

const NODE20_ACTIONS_WARNING = /node\.js\s*20|node20|actions?\s+deprecation/i;
const BLOCKING_CONCLUSIONS = new Set<HeadBoundRunEvidence["conclusion"]>([
  "failure",
  "timed_out",
  "cancelled",
  "action_required",
]);
const PASSING_CONCLUSIONS = new Set<HeadBoundRunEvidence["conclusion"]>(["success", "neutral", "skipped"]);

function isNode20ActionsWarning(notice: string): boolean {
  return NODE20_ACTIONS_WARNING.test(notice);
}

function currentHeadRuns(input: ResolvedHeadBoundaryInput): HeadBoundRunEvidence[] {
  return input.surfaced_runs.filter((run) => run.head_sha === input.current_head_sha);
}

function successfulCurrentHeadRunIds(input: ResolvedHeadBoundaryInput): Set<string> {
  return new Set(
    currentHeadRuns(input)
      .filter((run) => PASSING_CONCLUSIONS.has(run.conclusion))
      .map((run) => run.id),
  );
}

function blockingCurrentHeadRuns(input: ResolvedHeadBoundaryInput): HeadBoundRunEvidence[] {
  return currentHeadRuns(input).filter((run) => BLOCKING_CONCLUSIONS.has(run.conclusion));
}

function missingRequiredRuns(input: ResolvedHeadBoundaryInput): string[] {
  const surfacedSuccessIds = successfulCurrentHeadRunIds(input);
  return input.required_successful_run_ids.filter((id) => !surfacedSuccessIds.has(id));
}

export function evaluateResolvedHeadBoundary(input: ResolvedHeadBoundaryInput): ResolvedHeadBoundaryVerdict {
  const warnings = input.notices.filter(isNode20ActionsWarning);
  const headMoved = input.current_head_sha !== input.resolved_head_sha;
  const blockingRuns = blockingCurrentHeadRuns(input);
  const missingRuns = missingRequiredRuns(input);
  const boundaryComplete =
    !headMoved &&
    missingRuns.length === 0 &&
    blockingRuns.length === 0 &&
    input.blocker_issue_state === "closed" &&
    input.pr_is_draft === false;

  if (headMoved) {
    return {
      ok: input.proposed_move_class === "fresh_status_readback",
      action: "read_fresh_status",
      reason: `PR head moved from ${input.resolved_head_sha} to ${input.current_head_sha}`,
      resolved_boundary_survives: false,
      decisive_evidence: [`head moved from ${input.resolved_head_sha} to ${input.current_head_sha}`],
      blockers: input.proposed_move_class === "fresh_status_readback" ? [] : ["moved head requires fresh status readback before a repaired-head claim"],
      warnings,
    };
  }

  if (blockingRuns.length > 0) {
    return {
      ok: input.proposed_move_class === "repair_new_current_head_failure",
      action: "repair_new_current_head_failure",
      reason: "new current-head blocking run surfaced",
      resolved_boundary_survives: false,
      decisive_evidence: blockingRuns.map((run) => `${run.id}: ${run.conclusion}`),
      blockers: input.proposed_move_class === "repair_new_current_head_failure" ? [] : ["repair the new current-head failure instead of reopening the old blocker"],
      warnings,
    };
  }

  if (boundaryComplete && input.proposed_move_class === "reopen_repaired_head_status_blocker") {
    return {
      ok: false,
      action: "block_repaired_head_reopen",
      reason: "repaired-head status readback already surfaced and the blocker boundary is resolved",
      resolved_boundary_survives: true,
      decisive_evidence: [
        `resolved head ${input.resolved_head_sha}`,
        ...input.required_successful_run_ids.map((id) => `successful repaired-head run ${id}`),
        "blocker issue closed",
        "PR ready for review",
      ],
      blockers: ["do not reopen ci-status-readback for the repaired head without a moved head or new current-head failure"],
      warnings,
    };
  }

  if (!boundaryComplete) {
    return {
      ok: input.proposed_move_class === "exact_external_blocker" && Boolean(input.explicit_blocker?.trim()),
      action: "emit_exact_external_blocker",
      reason: input.explicit_blocker ?? "resolved-head boundary is incomplete",
      resolved_boundary_survives: false,
      decisive_evidence: [],
      blockers: [
        ...missingRuns.map((id) => `missing successful repaired-head run ${id}`),
        ...(input.blocker_issue_state !== "closed" ? ["blocker issue is not closed"] : []),
        ...(input.pr_is_draft ? ["PR is still draft"] : []),
      ],
      warnings,
    };
  }

  return {
    ok: true,
    action: input.proposed_move_class === "fresh_status_readback" ? "read_fresh_status" : "continue_external_embodiment",
    reason: "resolved repaired-head boundary survives; continue with a non-repeated embodiment increment",
    resolved_boundary_survives: true,
    decisive_evidence: [
      `resolved head ${input.resolved_head_sha}`,
      ...input.required_successful_run_ids.map((id) => `successful repaired-head run ${id}`),
      "blocker issue closed",
      "PR ready for review",
    ],
    blockers: [],
    warnings,
  };
}
