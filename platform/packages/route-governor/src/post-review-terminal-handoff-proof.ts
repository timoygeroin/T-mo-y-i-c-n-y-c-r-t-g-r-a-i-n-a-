import {
  routePostReviewTerminalHandoff,
  type PostReviewTerminalHandoffInput,
} from "./post-review-terminal-handoff.js";
import type { FinalReviewOutcomeRouterVerdict } from "./final-review-outcome-router.js";
import type { DownstreamAuthorityConsumptionVerdict } from "./downstream-authority-consumption-lease.js";

function outcome(overrides: Partial<FinalReviewOutcomeRouterVerdict> = {}): FinalReviewOutcomeRouterVerdict {
  return {
    ok: true,
    action: "await_review_feedback",
    outcome_id: "review-request-proof",
    branch: "monday-platform-genesis-01",
    head_sha: "live-head",
    command: "request_final_review",
    decisive_evidence: ["review request receipt"],
    blockers: [],
    next_route: "wait for live-head review feedback",
    ...overrides,
  };
}

function authority(overrides: Partial<DownstreamAuthorityConsumptionVerdict> = {}): DownstreamAuthorityConsumptionVerdict {
  return {
    ok: true,
    action: "admit_downstream_authority",
    authority_id: "downstream-authority-proof",
    authority_kind: "review_request",
    branch: "monday-platform-genesis-01",
    head_sha: "live-head",
    consumed_status_lease_id: "status-lease-proof",
    decisive_evidence: ["current status lease consumed"],
    blockers: [],
    warnings: [],
    next_route: "consume once",
    ...overrides,
  };
}

function base(overrides: Partial<PostReviewTerminalHandoffInput> = {}): PostReviewTerminalHandoffInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: "live-head",
    handoff_id: "post-review-terminal-handoff-proof",
    spent_handoff_ids: [],
    outcome: outcome(),
    downstream_authority: authority(),
    ...overrides,
  };
}

function expectAction(name: string, input: PostReviewTerminalHandoffInput, action: string, ok: boolean): void {
  const verdict = routePostReviewTerminalHandoff(input);
  if (verdict.action !== action || verdict.ok !== ok) {
    throw new Error(`${name} expected ${action}/${ok}, got ${verdict.action}/${verdict.ok}: ${verdict.blockers.join("; ")}`);
  }
}

export function runPostReviewTerminalHandoffProof(): void {
  expectAction("review request handoff", base(), "open_review_feedback_wait", true);

  expectAction(
    "merge receipt handoff",
    base({
      outcome: outcome({
        action: "seal_merge_completion",
        outcome_id: "merge-proof",
        command: "merge_finalization",
        decisive_evidence: ["merge result receipt"],
      }),
    }),
    "seal_terminal_merge_receipt",
    true,
  );

  expectAction(
    "moved head handoff",
    base({
      outcome: outcome({
        ok: false,
        action: "route_to_moved_head_status",
        outcome_id: "moved-head-proof",
        blockers: ["fresh status/readback required for moved head next-head"],
      }),
    }),
    "require_moved_head_status",
    false,
  );

  expectAction(
    "exact blocker handoff",
    base({
      outcome: outcome({
        ok: false,
        action: "route_to_exact_external_blocker",
        outcome_id: "blocked-proof",
        blockers: ["GitHub rejected requesting review from the author account"],
      }),
    }),
    "emit_exact_external_blocker",
    false,
  );

  expectAction(
    "stale authority handoff",
    base({
      downstream_authority: authority({
        ok: false,
        action: "block_stale_status_lease",
        blockers: ["status lease belongs to old-head, not live-head"],
      }),
    }),
    "block_downstream_authority",
    false,
  );
}

runPostReviewTerminalHandoffProof();
