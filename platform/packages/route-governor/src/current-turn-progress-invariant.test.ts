import assert from "node:assert/strict";
import test from "node:test";

import {
  enforceCurrentTurnProgressInvariant,
  type CurrentTurnProgressInvariantInput,
} from "./current-turn-progress-invariant.js";

const LIVE_HEAD = "d57ae51212880926194f293df95a6dc91ec11f44";
const PRIOR_STATUS_HEAD = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function input(overrides: Partial<CurrentTurnProgressInvariantInput> = {}): CurrentTurnProgressInvariantInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: LIVE_HEAD,
    last_status_head_sha: PRIOR_STATUS_HEAD,
    scope_reopened: false,
    prohibited_progress_classes: [
      "metadata_reread",
      "duplicate_ci_summary",
      "duplicate_comment",
      "duplicate_label",
      "local_memory_guard",
      "guessed_future_ci",
      "reclose_completed_blocker",
      "old_repaired_head_blocker",
    ],
    candidate: {
      progress_class: "external_platform_embodiment",
      branch: "monday-platform-genesis-01",
      base_head_sha: LIVE_HEAD,
      terminal_operations: ["external_platform_embodiment"],
      changed_files: ["platform/packages/route-governor/src/current-turn-progress-invariant.ts"],
      behavior_exports: ["enforceCurrentTurnProgressInvariant"],
      routing_effects: ["future turns must select exactly one admitted progress class"],
      proof_artifacts: ["platform/packages/route-governor/src/current-turn-progress-invariant.test.ts"],
    },
    ...overrides,
  };
}

test("admits a single behavior-bearing external embodiment on the live head", () => {
  const verdict = enforceCurrentTurnProgressInvariant(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_external_embodiment");
  assert.equal(verdict.admitted_progress_class, "external_platform_embodiment");
  assert.ok(verdict.decisive_evidence.includes("enforceCurrentTurnProgressInvariant"));
});

test("blocks reopening scope as current turn progress", () => {
  const verdict = enforceCurrentTurnProgressInvariant(input({ scope_reopened: true }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_scope_reopen");
});

test("blocks bundled terminal operations", () => {
  const verdict = enforceCurrentTurnProgressInvariant(
    input({
      candidate: {
        ...input().candidate,
        terminal_operations: ["external_platform_embodiment", "fresh_status_readback"],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_terminal_bundle");
});

test("blocks explicitly prohibited non-progress classes", () => {
  const verdict = enforceCurrentTurnProgressInvariant(
    input({
      candidate: {
        ...input().candidate,
        progress_class: "duplicate_ci_summary",
        terminal_operations: ["external_platform_embodiment"],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_terminal_bundle");
});

test("admits fresh status readback only when the live head moved since last status", () => {
  const verdict = enforceCurrentTurnProgressInvariant(
    input({
      candidate: {
        progress_class: "fresh_status_readback",
        branch: "monday-platform-genesis-01",
        base_head_sha: LIVE_HEAD,
        terminal_operations: ["fresh_status_readback"],
        changed_files: [],
        behavior_exports: [],
        routing_effects: [],
        proof_artifacts: [],
      },
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_fresh_status_readback");
});

test("blocks fresh status readback when neither head nor checks changed", () => {
  const verdict = enforceCurrentTurnProgressInvariant(
    input({
      last_status_head_sha: LIVE_HEAD,
      candidate: {
        progress_class: "fresh_status_readback",
        branch: "monday-platform-genesis-01",
        base_head_sha: LIVE_HEAD,
        terminal_operations: ["fresh_status_readback"],
        changed_files: [],
        behavior_exports: [],
        routing_effects: [],
        proof_artifacts: [],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_status_basis");
});

test("blocks exact blockers that do not name the external blocker", () => {
  const verdict = enforceCurrentTurnProgressInvariant(
    input({
      candidate: {
        progress_class: "exact_external_blocker",
        branch: "monday-platform-genesis-01",
        base_head_sha: LIVE_HEAD,
        terminal_operations: ["exact_external_blocker"],
        changed_files: [],
        behavior_exports: [],
        routing_effects: [],
        proof_artifacts: [],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_exact_blocker");
});

test("blocks an embodiment candidate based on a stale repaired head", () => {
  const verdict = enforceCurrentTurnProgressInvariant(
    input({
      candidate: {
        ...input().candidate,
        base_head_sha: PRIOR_STATUS_HEAD,
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_embodiment_base");
});
