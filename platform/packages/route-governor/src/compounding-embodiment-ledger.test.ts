import assert from "node:assert/strict";
import { test } from "node:test";

import {
  compileCompoundingEmbodimentLedger,
  type CompoundingEmbodimentCandidate,
  type PriorEmbodimentIncrement,
} from "./compounding-embodiment-ledger.js";

const branch = "monday-platform-genesis-01";
const head = "b702ebea66e4a037354915abb0c130b0308c1f30";

const prior: PriorEmbodimentIncrement[] = [
  {
    increment_id: "warning-maintenance-router",
    artifact_class: "warning-maintenance-routing",
    capability_axes: ["status_readback"],
    routing_effects: ["non-blocking warnings stay below executable embodiment"],
  },
];

function candidate(overrides: Partial<CompoundingEmbodimentCandidate> = {}): CompoundingEmbodimentCandidate {
  return {
    increment_id: "compounding-embodiment-ledger",
    branch,
    live_head_sha: head,
    artifact_class: "compounding-ledger-gate",
    capability_axes: ["runtime_execution"],
    changed_files: ["platform/packages/route-governor/src/compounding-embodiment-ledger.ts"],
    executable_artifacts: ["compileCompoundingEmbodimentLedger"],
    routing_effects: ["future increments must advance an unspent capability axis before branch movement"],
    proof_artifacts: ["dist/compounding-embodiment-ledger.test.js"],
    ...overrides,
  };
}

test("records an executable increment that advances an unspent capability axis", () => {
  const verdict = compileCompoundingEmbodimentLedger({
    branch,
    active_branch: branch,
    live_head_sha: head,
    prior_increments: prior,
    candidate: candidate(),
  });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "record_compounding_increment");
  assert.equal(verdict.ledger_entry?.increment_id, "compounding-embodiment-ledger");
  assert.deepEqual(verdict.ledger_entry?.capability_axes, ["runtime_execution"]);
  assert.ok(verdict.decisive_evidence.includes("new capability axis: runtime_execution"));
});

test("blocks an increment that repeats an already recorded id", () => {
  const verdict = compileCompoundingEmbodimentLedger({
    branch,
    active_branch: branch,
    live_head_sha: head,
    prior_increments: [
      ...prior,
      {
        increment_id: "compounding-embodiment-ledger",
        artifact_class: "older-ledger-gate",
        capability_axes: ["runtime_execution"],
        routing_effects: ["older route"],
      },
    ],
    candidate: candidate({ artifact_class: "second-ledger-gate", capability_axes: ["external_write"] }),
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_repeated_increment");
  assert.ok(verdict.blockers.some((blocker) => blocker.includes("increment id already recorded")));
});

test("blocks an increment that does not advance an unspent capability axis", () => {
  const verdict = compileCompoundingEmbodimentLedger({
    branch,
    active_branch: branch,
    live_head_sha: head,
    prior_increments: prior,
    candidate: candidate({ capability_axes: ["status_readback"] }),
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_repeated_increment");
  assert.ok(verdict.blockers.includes("candidate does not advance an unspent capability axis"));
});

test("blocks proof-only executable changes", () => {
  const verdict = compileCompoundingEmbodimentLedger({
    branch,
    active_branch: branch,
    live_head_sha: head,
    prior_increments: prior,
    candidate: candidate({ changed_files: ["platform/packages/route-governor/src/compounding-embodiment-ledger.test.ts"] }),
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_executable_increment");
  assert.ok(verdict.blockers.includes("candidate does not change a non-proof executable platform file"));
});

test("blocks candidates bound to a stale live head", () => {
  const verdict = compileCompoundingEmbodimentLedger({
    branch,
    active_branch: branch,
    live_head_sha: head,
    prior_increments: prior,
    candidate: candidate({ live_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }),
  });

  assert.equal(verdict.ok, false);
  assert.ok(verdict.blockers.some((blocker) => blocker.includes("does not match live head")));
});
