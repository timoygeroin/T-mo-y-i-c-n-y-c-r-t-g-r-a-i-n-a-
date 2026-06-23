import assert from "node:assert/strict";
import test from "node:test";

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
    outcome_id: "review-request-result-1",
    branch: "monday-platform-genesis-01",
    head_sha: "live-head",
    command: "request_final_review",
    decisive_evidence: ["review request receipt 42"],
    blockers: [],
    next_route: "wait for live-head review feedback",
    ...overrides,
  };
}

function authority(overrides: Partial<DownstreamAuthorityConsumptionVerdict> = {}): DownstreamAuthorityConsumptionVerdict {
  return {
    ok: true,
    action: "admit_downstream_authority",
    authority_id: "downstream-authority-1",
    authority_kind: "review_request",
    branch: "monday-platform-genesis-01",
    head_sha: "live-head",
    consumed_status_lease_id: "status-lease-1",
    decisive_evidence: ["live-head status lease consumed"],
    blockers: [],
    warnings: ["Node.js 20 Actions deprecation notice is warning-only"],
    next_route: "consume this downstream authority once",
    ...overrides,
  };
}

function input(overrides: Partial<PostReviewTerminalHandoffInput> = {}): PostReviewTerminalHandoffInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: "live-head",
    handoff_id: "post-review-terminal-handoff-1",
    spent_handoff_ids: [],
    outcome: outcome(),
    downstream_authority: authority(),
    ...overrides,
  };
}

test("opens review feedback wait from a live-head review request outcome", () => {
  const verdict = routePostReviewTerminalHandoff(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "open_review_feedback_wait");
  assert.equal(verdict.consumed_authority_id, "downstream-authority-1");
  assert.deepEqual(verdict.blockers, []);
  assert.match(verdict.next_route, /do not add comments, labels, or metadata rereads/);
});

test("seals merge completion from a live-head merge outcome", () => {
  const verdict = routePostReviewTerminalHandoff(
    input({
      outcome: outcome({
        action: "seal_merge_completion",
        outcome_id: "merge-result-1",
        command: "merge_finalization",
        decisive_evidence: ["merge result receipt 99"],
        next_route: "seal the merged manifestation receipt",
      }),
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "seal_terminal_merge_receipt");
  assert.match(verdict.next_route, /stop adding embodiment increments/);
});

test("routes moved-head outcomes to fresh status", () => {
  const verdict = routePostReviewTerminalHandoff(
    input({
      outcome: outcome({
        ok: false,
        action: "route_to_moved_head_status",
        outcome_id: "moved-head-result-1",
        blockers: ["fresh status/readback required for moved head next-head"],
      }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "require_moved_head_status");
  assert.deepEqual(verdict.blockers, ["fresh status/readback required for moved head next-head"]);
});

test("emits exact blockers from failed downstream final-review outcomes", () => {
  const verdict = routePostReviewTerminalHandoff(
    input({
      outcome: outcome({
        ok: false,
        action: "route_to_exact_external_blocker",
        outcome_id: "review-request-failed-1",
        blockers: ["GitHub rejected requesting review from the author account"],
      }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "emit_exact_external_blocker");
  assert.deepEqual(verdict.blockers, ["GitHub rejected requesting review from the author account"]);
});

test("blocks reused handoffs", () => {
  const verdict = routePostReviewTerminalHandoff(input({ spent_handoff_ids: ["post-review-terminal-handoff-1"] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_reused_handoff");
  assert.match(verdict.blockers.join("; "), /already spent/);
});

test("blocks stale outcome heads", () => {
  const verdict = routePostReviewTerminalHandoff(input({ outcome: outcome({ head_sha: "old-head" }) }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_head_mismatch");
});

test("blocks failed downstream authority before terminal handoff", () => {
  const verdict = routePostReviewTerminalHandoff(
    input({
      downstream_authority: authority({
        ok: false,
        action: "require_moved_head_status",
        blockers: ["live head has no status lease after branch move"],
      }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_downstream_authority");
  assert.deepEqual(verdict.blockers, ["live head has no status lease after branch move"]);
});
