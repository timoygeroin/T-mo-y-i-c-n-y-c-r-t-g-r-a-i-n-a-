import type { FinalReviewOutcomeRouterVerdict } from "./final-review-outcome-router.js";
import type { DownstreamAuthorityConsumptionVerdict } from "./downstream-authority-consumption-lease.js";

export type PostReviewTerminalHandoffAction =
  | "open_review_feedback_wait"
  | "seal_terminal_merge_receipt"
  | "require_moved_head_status"
  | "emit_exact_external_blocker"
  | "block_reused_handoff"
  | "block_branch_mismatch"
  | "block_head_mismatch"
  | "block_missing_result_evidence"
  | "block_non_progress_handoff"
  | "block_downstream_authority";

export interface PostReviewTerminalHandoffInput {
  active_branch: string;
  live_head_sha: string;
  handoff_id: string;
  spent_handoff_ids: string[];
  outcome: FinalReviewOutcomeRouterVerdict;
  downstream_authority?: DownstreamAuthorityConsumptionVerdict;
}

export interface PostReviewTerminalHandoffVerdict {
  ok: boolean;
  action: PostReviewTerminalHandoffAction;
  handoff_id: string | null;
  branch: string;
  head_sha: string;
  consumed_authority_id: string | null;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

const NON_PROGRESS_OUTCOME_ACTIONS = new Set<FinalReviewOutcomeRouterVerdict["action"]>([
  "block_reused_outcome",
  "block_command_mismatch",
  "block_missing_result_evidence",
]);

const AUTHORITY_REQUIRED_OUTCOME_ACTIONS = new Set<FinalReviewOutcomeRouterVerdict["action"]>([
  "await_review_feedback",
  "seal_merge_completion",
]);

function base(input: PostReviewTerminalHandoffInput): Pick<
  PostReviewTerminalHandoffVerdict,
  "handoff_id" | "branch" | "head_sha" | "warnings"
> {
  return {
    handoff_id: input.handoff_id.trim() || null,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    warnings: input.downstream_authority?.warnings ?? [],
  };
}

function evidence(input: PostReviewTerminalHandoffInput): string[] {
  return [
    `handoff ${input.handoff_id.trim() || "<missing>"}`,
    `outcome ${input.outcome.outcome_id ?? "<none>"}`,
    `outcome action ${input.outcome.action}`,
    `live head ${input.live_head_sha}`,
    ...input.outcome.decisive_evidence,
  ];
}

function block(
  input: PostReviewTerminalHandoffInput,
  action: Exclude<
    PostReviewTerminalHandoffAction,
    | "open_review_feedback_wait"
    | "seal_terminal_merge_receipt"
    | "require_moved_head_status"
    | "emit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  decisiveEvidence: string[] = [],
): PostReviewTerminalHandoffVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    consumed_authority_id: null,
    decisive_evidence: decisiveEvidence,
    blockers,
    next_route: nextRoute,
  };
}

export function routePostReviewTerminalHandoff(
  input: PostReviewTerminalHandoffInput,
): PostReviewTerminalHandoffVerdict {
  const handoffId = input.handoff_id.trim();
  const routeEvidence = evidence(input);

  if (!handoffId || input.spent_handoff_ids.includes(handoffId)) {
    return block(
      input,
      "block_reused_handoff",
      [handoffId ? `post-review terminal handoff already spent: ${handoffId}` : "post-review terminal handoff has no id"],
      "capture a fresh final-review outcome before opening another terminal handoff",
      routeEvidence,
    );
  }

  if (input.outcome.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`outcome branch ${input.outcome.branch} is not active branch ${input.active_branch}`],
      "discard cross-branch final-review outcomes before terminal handoff",
      routeEvidence,
    );
  }

  if (input.outcome.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_head_mismatch",
      [`outcome head ${input.outcome.head_sha} is not live head ${input.live_head_sha}`],
      "rebuild final-review outcome routing from the live head before terminal handoff",
      routeEvidence,
    );
  }

  if (input.outcome.decisive_evidence.length === 0) {
    return block(
      input,
      "block_missing_result_evidence",
      ["post-review terminal handoff requires concrete final-review outcome evidence"],
      "attach external review-request, merge, moved-head, or blocker evidence before handoff",
      routeEvidence,
    );
  }

  if (NON_PROGRESS_OUTCOME_ACTIONS.has(input.outcome.action)) {
    return block(
      input,
      "block_non_progress_handoff",
      input.outcome.blockers.length > 0 ? input.outcome.blockers : [`outcome action ${input.outcome.action} cannot open terminal handoff`],
      "produce a fresh downstream result, moved-head surface, merge receipt, or exact external blocker",
      routeEvidence,
    );
  }

  if (AUTHORITY_REQUIRED_OUTCOME_ACTIONS.has(input.outcome.action) && !input.downstream_authority) {
    return block(
      input,
      "block_downstream_authority",
      [`${input.outcome.action} requires consumed downstream authority for live head ${input.live_head_sha}`],
      "consume live-head downstream authority before opening review feedback wait or sealing merge completion",
      routeEvidence,
    );
  }

  if (input.downstream_authority) {
    if (!input.downstream_authority.ok || input.downstream_authority.branch !== input.active_branch || input.downstream_authority.head_sha !== input.live_head_sha) {
      return block(
        input,
        "block_downstream_authority",
        input.downstream_authority.blockers.length > 0
          ? input.downstream_authority.blockers
          : [`downstream authority ${input.downstream_authority.authority_id ?? "<none>"} is not live-head admitted`],
        "consume only live-head downstream authority before terminal handoff",
        [...routeEvidence, ...input.downstream_authority.decisive_evidence],
      );
    }
  }

  const consumedAuthorityId = input.downstream_authority?.authority_id ?? null;

  if (input.outcome.action === "await_review_feedback") {
    return {
      ...base(input),
      ok: true,
      action: "open_review_feedback_wait",
      consumed_authority_id: consumedAuthorityId,
      decisive_evidence: routeEvidence,
      blockers: [],
      next_route: "wait for live-head review feedback; do not add comments, labels, or metadata rereads as progress",
    };
  }

  if (input.outcome.action === "seal_merge_completion") {
    return {
      ...base(input),
      ok: true,
      action: "seal_terminal_merge_receipt",
      consumed_authority_id: consumedAuthorityId,
      decisive_evidence: routeEvidence,
      blockers: [],
      next_route: "record merge completion and stop adding embodiment increments to the PR branch",
    };
  }

  if (input.outcome.action === "route_to_moved_head_status") {
    return {
      ...base(input),
      ok: false,
      action: "require_moved_head_status",
      consumed_authority_id: consumedAuthorityId,
      decisive_evidence: routeEvidence,
      blockers: input.outcome.blockers,
      next_route: "obtain fresh status/readback for the moved head before review or merge continuation",
    };
  }

  return {
    ...base(input),
    ok: false,
    action: "emit_exact_external_blocker",
    consumed_authority_id: consumedAuthorityId,
    decisive_evidence: routeEvidence,
    blockers: input.outcome.blockers.length > 0 ? input.outcome.blockers : [`final-review outcome action ${input.outcome.action}`],
    next_route: "remove the named final-review blocker before another terminal handoff",
  };
}
