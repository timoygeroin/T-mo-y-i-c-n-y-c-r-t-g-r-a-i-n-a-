import test from "node:test";
import assert from "node:assert/strict";
import {
  compileBranchProtectionReadiness,
  type BranchProtectionReadinessInput,
} from "./branch-protection-readiness.js";

const head = "765137c22cc6fc4e02568b44b8e0f049b9e77749";

function input(overrides: Partial<BranchProtectionReadinessInput> = {}): BranchProtectionReadinessInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: head,
    rule_source: {
      source_id: "repository-ruleset-main",
      branch: "monday-platform-genesis-01",
      require_status_contexts: ["Monday Platform CI", "Route Governor Proof"],
      required_approving_review_count: 1,
      evidence: ["ruleset requires CI, proof, and one approval"],
    },
    statuses: [
      {
        context: "Monday Platform CI",
        head_sha: head,
        state: "success",
        evidence: ["ci passed"],
      },
      {
        context: "Route Governor Proof",
        head_sha: head,
        state: "success",
        evidence: ["proof passed"],
      },
    ],
    reviews: [
      {
        reviewer: "platform-review-team",
        head_sha: head,
        state: "approved",
        evidence: ["review approved"],
      },
    ],
    ...overrides,
  };
}

test("admits branch protection when required statuses and approvals are live-head bound", () => {
  const verdict = compileBranchProtectionReadiness(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "branch_protection_ready");
  assert.equal(verdict.head_sha, head);
  assert.deepEqual(verdict.blockers, []);
  assert(verdict.decisive_evidence.includes("required status passed:Monday Platform CI"));
  assert(verdict.decisive_evidence.includes("required approval:platform-review-team"));
});

test("routes to required status readback when a required context is missing", () => {
  const verdict = compileBranchProtectionReadiness(
    input({
      statuses: [
        {
          context: "Monday Platform CI",
          head_sha: head,
          state: "success",
          evidence: ["ci passed"],
        },
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "route_to_required_status_readback");
  assert(verdict.blockers.some((blocker) => blocker.includes("Route Governor Proof")));
});

test("blocks stale status or review evidence before merge handoff", () => {
  const verdict = compileBranchProtectionReadiness(
    input({
      statuses: [
        {
          context: "Monday Platform CI",
          head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
          state: "success",
          evidence: ["old repaired-head success"],
        },
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_evidence_head");
  assert(verdict.blockers.some((blocker) => blocker.includes("b38ea247602ae8ebba80c4120ad03b41b26bd841")));
});

test("routes to required review when approvals are insufficient", () => {
  const verdict = compileBranchProtectionReadiness(input({ reviews: [] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "route_to_required_review");
  assert(verdict.blockers.includes("required approvals 1; live-head approvals 0"));
});

test("routes to review repair when changes are requested", () => {
  const verdict = compileBranchProtectionReadiness(
    input({
      reviews: [
        {
          reviewer: "platform-review-team",
          head_sha: head,
          state: "changes_requested",
          evidence: ["requested changes on route surface"],
        },
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "route_to_review_repair");
  assert(verdict.blockers.includes("changes requested by platform-review-team"));
});
