import test from "node:test";
import assert from "node:assert/strict";

import {
  gateFinalAuthorityTerminalCommand,
  type FinalAuthorityTerminalCandidate,
  type FinalAuthorityTerminalGateInput,
} from "./final-authority-terminal-gate.js";
import type { FinalReviewAuthorityConsumptionVerdict } from "./final-review-authority-consumption.js";

const BRANCH = "monday-platform-genesis-01";
const HEAD = "terminal-head";

function consumption(overrides: Partial<FinalReviewAuthorityConsumptionVerdict> = {}): FinalReviewAuthorityConsumptionVerdict {
  return {
    ok: true,
    action: "accept_authority_consumption",
    consumption_id: "consume-final-review-authority",
    bundle_id: "bundle-final-review-authority",
    branch: BRANCH,
    head_sha: HEAD,
    command: "merge_finalization",
    decisive_evidence: ["status lease", "review lease", "mergeability lease", "blocker retirement"],
    blockers: [],
    next_route: "seal this consumption id",
    ...overrides,
  };
}

function candidate(overrides: Partial<FinalAuthorityTerminalCandidate> = {}): FinalAuthorityTerminalCandidate {
  return {
    candidate_id: "terminal-merge-execution",
    kind: "merge_execution",
    changed_files: ["platform/packages/route-governor/src/final-authority-terminal-gate.ts"],
    executable_artifacts: ["gateFinalAuthorityTerminalCommand"],
    routing_artifacts: ["final authority terminal gate"],
    ...overrides,
  };
}

function input(overrides: Partial<FinalAuthorityTerminalGateInput> = {}): FinalAuthorityTerminalGateInput {
  return {
    active_branch: BRANCH,
    live_head_sha: HEAD,
    gate_id: "gate-terminal-authority",
    spent_gate_ids: [],
    authority_consumption: consumption(),
    candidate: candidate(),
    ...overrides,
  };
}

test("admits the terminal merge execution admitted by final-review authority", () => {
  const verdict = gateFinalAuthorityTerminalCommand(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_terminal_merge_execution");
  assert.deepEqual(verdict.blockers, []);
  assert.ok(verdict.decisive_evidence.includes("gateFinalAuthorityTerminalCommand"));
});

test("admits a terminal review request when that is the consumed authority command", () => {
  const verdict = gateFinalAuthorityTerminalCommand(
    input({
      authority_consumption: consumption({ command: "request_final_review" }),
      candidate: candidate({ candidate_id: "terminal-review-request", kind: "review_request" }),
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_terminal_review_request");
});

test("blocks ordinary embodiment after final-review authority has been accepted", () => {
  const verdict = gateFinalAuthorityTerminalCommand(
    input({ candidate: candidate({ candidate_id: "ordinary-follow-on-embodiment", kind: "ordinary_embodiment" }) }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_new_embodiment_after_final_authority");
  assert.match(verdict.blockers.join("\n"), /ordinary_embodiment cannot follow/);
});

test("blocks terminal candidates bound to stale authority head", () => {
  const verdict = gateFinalAuthorityTerminalCommand(
    input({ authority_consumption: consumption({ head_sha: "stale-head" }) }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_wrong_head");
});

test("allows only a behavior-bearing repair when the terminal result receipt failed", () => {
  const verdict = gateFinalAuthorityTerminalCommand(
    input({
      authority_consumption: consumption({
        ok: false,
        action: "block_failed_result_receipt",
        blockers: ["merge command failed with protected-branch policy"],
      }),
      candidate: candidate({
        candidate_id: "terminal-result-repair",
        kind: "failed_terminal_repair",
        changed_files: ["platform/packages/route-governor/src/merge-result-receipt.ts"],
      }),
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_failed_terminal_repair");
});

test("rejects repair-shaped candidates without executable repair evidence", () => {
  const verdict = gateFinalAuthorityTerminalCommand(
    input({
      authority_consumption: consumption({
        ok: false,
        action: "block_failed_result_receipt",
        blockers: ["merge command failed"],
      }),
      candidate: candidate({
        candidate_id: "proof-only-terminal-repair",
        kind: "failed_terminal_repair",
        changed_files: ["platform/packages/route-governor/src/merge-result-receipt-proof.ts"],
      }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_repair_evidence");
});

test("routes exact external blocker authority without pretending it is merge execution", () => {
  const verdict = gateFinalAuthorityTerminalCommand(
    input({
      authority_consumption: consumption({
        ok: true,
        action: "emit_exact_external_blocker",
        command: "exact_external_blocker",
        blockers: ["review approval is absent on the live head"],
      }),
      candidate: candidate({
        candidate_id: "terminal-exact-blocker",
        kind: "exact_external_blocker",
        blocker: "review approval is absent on the live head",
      }),
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_exact_external_blocker");
  assert.deepEqual(verdict.blockers, ["review approval is absent on the live head"]);
});
