import { routeFinalReviewOutcome, type FinalReviewOutcomeRouterInput } from "./final-review-outcome-router.js";

function base(overrides: Partial<FinalReviewOutcomeRouterInput> = {}): FinalReviewOutcomeRouterInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: "live-head",
    expected_command: "request_final_review",
    spent_outcome_ids: [],
    outcome: {
      outcome_id: "final-review-outcome-proof",
      branch: "monday-platform-genesis-01",
      head_sha: "live-head",
      command: "request_final_review",
      kind: "review_requested",
      evidence: ["review request result receipt"],
      blockers: [],
    },
    ...overrides,
  };
}

function expectAction(name: string, input: FinalReviewOutcomeRouterInput, action: string, ok: boolean): void {
  const verdict = routeFinalReviewOutcome(input);
  if (verdict.action !== action || verdict.ok !== ok) {
    throw new Error(`${name} expected ${action}/${ok}, got ${verdict.action}/${verdict.ok}: ${verdict.blockers.join("; ")}`);
  }
}

export function runFinalReviewOutcomeRouterProof(): void {
  expectAction("review request result", base(), "await_review_feedback", true);

  expectAction(
    "merge result",
    base({
      expected_command: "merge_finalization",
      outcome: {
        outcome_id: "merge-proof",
        branch: "monday-platform-genesis-01",
        head_sha: "live-head",
        command: "merge_finalization",
        kind: "merged",
        evidence: ["merge result receipt"],
        blockers: [],
      },
    }),
    "seal_merge_completion",
    true,
  );

  expectAction(
    "stale result",
    base({
      outcome: {
        outcome_id: "stale-proof",
        branch: "monday-platform-genesis-01",
        head_sha: "old-head",
        command: "request_final_review",
        kind: "review_requested",
        evidence: ["old result receipt"],
        blockers: [],
      },
    }),
    "block_head_mismatch",
    false,
  );

  expectAction(
    "moved head result",
    base({
      outcome: {
        outcome_id: "moved-head-proof",
        branch: "monday-platform-genesis-01",
        head_sha: "live-head",
        command: "request_final_review",
        kind: "head_moved",
        evidence: ["branch moved while downstream command was active"],
        blockers: [],
        next_head_sha: "next-head",
      },
    }),
    "route_to_moved_head_status",
    false,
  );

  expectAction(
    "failed review request",
    base({
      outcome: {
        outcome_id: "failed-review-request-proof",
        branch: "monday-platform-genesis-01",
        head_sha: "live-head",
        command: "request_final_review",
        kind: "review_request_failed",
        evidence: ["review request result receipt"],
        blockers: ["GitHub rejected requesting review from the author account"],
      },
    }),
    "route_to_exact_external_blocker",
    false,
  );
}

runFinalReviewOutcomeRouterProof();
