import test from "node:test";
import assert from "node:assert/strict";
import {
  routeFinalReviewOutcome,
  type FinalReviewOutcomeRouterInput,
} from "./final-review-outcome-router.js";

function input(overrides: Partial<FinalReviewOutcomeRouterInput> = {}): FinalReviewOutcomeRouterInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: "live-head",
    expected_command: "request_final_review",
    spent_outcome_ids: [],
    outcome: {
      outcome_id: "review-request-1",
      branch: "monday-platform-genesis-01",
      head_sha: "live-head",
      command: "request_final_review",
      kind: "review_requested",
      evidence: ["review request receipt 42"],
      blockers: [],
    },
    ...overrides,
  };
}

test("routes a live-head review request result to feedback wait", () => {
  const verdict = routeFinalReviewOutcome(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "await_review_feedback");
  assert.deepEqual(verdict.blockers, []);
});

test("seals a live-head merge result", () => {
  const verdict = routeFinalReviewOutcome(
    input({
      expected_command: "merge_finalization",
      outcome: {
        outcome_id: "merge-1",
        branch: "monday-platform-genesis-01",
        head_sha: "live-head",
        command: "merge_finalization",
        kind: "merged",
        evidence: ["merge receipt 99"],
        blockers: [],
      },
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "seal_merge_completion");
  assert.match(verdict.next_route, /stop adding PR-branch embodiment increments/);
});

test("blocks reused outcome ids", () => {
  const verdict = routeFinalReviewOutcome(input({ spent_outcome_ids: ["review-request-1"] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_reused_outcome");
  assert.match(verdict.blockers.join("; "), /already spent/);
});

test("blocks stale head outcomes", () => {
  const verdict = routeFinalReviewOutcome(
    input({
      outcome: {
        outcome_id: "stale-review",
        branch: "monday-platform-genesis-01",
        head_sha: "old-head",
        command: "request_final_review",
        kind: "review_requested",
        evidence: ["old review request receipt"],
        blockers: [],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_head_mismatch");
});

test("blocks mismatched command outcomes", () => {
  const verdict = routeFinalReviewOutcome(
    input({
      expected_command: "merge_finalization",
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_command_mismatch");
});

test("routes moved-head outcomes to status readback", () => {
  const verdict = routeFinalReviewOutcome(
    input({
      outcome: {
        outcome_id: "head-moved-1",
        branch: "monday-platform-genesis-01",
        head_sha: "live-head",
        command: "request_final_review",
        kind: "head_moved",
        evidence: ["branch advanced while review command was in flight"],
        blockers: [],
        next_head_sha: "next-head",
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "route_to_moved_head_status");
  assert.match(verdict.blockers.join("; "), /next-head/);
});

test("turns failed downstream results into exact external blockers", () => {
  const verdict = routeFinalReviewOutcome(
    input({
      outcome: {
        outcome_id: "review-failed-1",
        branch: "monday-platform-genesis-01",
        head_sha: "live-head",
        command: "request_final_review",
        kind: "review_request_failed",
        evidence: ["review request API receipt"],
        blockers: ["GitHub rejected requesting review from the author account"],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "route_to_exact_external_blocker");
  assert.deepEqual(verdict.blockers, ["GitHub rejected requesting review from the author account"]);
});
