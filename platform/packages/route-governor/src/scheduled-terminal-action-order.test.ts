import assert from "node:assert/strict";
import test from "node:test";

import {
  compileScheduledTerminalActionOrder,
  type ScheduledTerminalActionOrderInput,
} from "./scheduled-terminal-action-order.js";

function input(overrides: Partial<ScheduledTerminalActionOrderInput> = {}): ScheduledTerminalActionOrderInput {
  return {
    order_id: "scheduled-terminal-order-live-head",
    active_branch: "monday-platform-genesis-01",
    live_head_sha: "live-head",
    prompt_head_sha: "live-head",
    previous_status_head_sha: "previous-status-head",
    repaired_historical_heads: ["b38ea247602ae8ebba80c4120ad03b41b26bd841"],
    spent_order_ids: [],
    spent_candidate_ids: [],
    candidates: [
      {
        candidate_id: "terminal-embodiment-order",
        kind: "external_platform_embodiment",
        branch: "monday-platform-genesis-01",
        head_sha: "live-head",
        evidence: ["live PR metadata confirmed branch head"],
        changed_files: ["platform/packages/route-governor/src/scheduled-terminal-action-order.ts"],
        behavior_exports: ["compileScheduledTerminalActionOrder"],
        routing_effects: ["future scheduled runs choose only live-head terminal actions"],
      },
    ],
    ...overrides,
  };
}

test("admits a live-head executable embodiment before weaker terminal options", () => {
  const verdict = compileScheduledTerminalActionOrder(
    input({
      candidates: [
        {
          candidate_id: "terminal-blocker-fallback",
          kind: "exact_external_blocker",
          branch: "monday-platform-genesis-01",
          head_sha: "live-head",
          evidence: ["fallback blocker candidate"],
          exact_blocker: "review authority unavailable",
        },
        {
          candidate_id: "terminal-embodiment-order",
          kind: "external_platform_embodiment",
          branch: "monday-platform-genesis-01",
          head_sha: "live-head",
          evidence: ["live PR metadata confirmed branch head"],
          changed_files: ["platform/packages/route-governor/src/scheduled-terminal-action-order.ts"],
          behavior_exports: ["compileScheduledTerminalActionOrder"],
          routing_effects: ["future scheduled runs choose only live-head terminal actions"],
        },
      ],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_external_platform_embodiment");
  assert.equal(verdict.admitted_candidate_id, "terminal-embodiment-order");
});

test("blocks prompt-carried repaired historical heads before considering candidates", () => {
  const verdict = compileScheduledTerminalActionOrder(
    input({ prompt_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_repaired_head_replay");
  assert.match(verdict.blockers.join("\n"), /repaired historical head/);
});

test("blocks duplicate metadata and CI summary candidates as non-progress", () => {
  const verdict = compileScheduledTerminalActionOrder(
    input({
      candidates: [
        {
          candidate_id: "duplicate-ci-summary",
          kind: "duplicate_ci_summary",
          branch: "monday-platform-genesis-01",
          head_sha: "live-head",
          evidence: ["old check summary pasted again"],
        },
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_progress_candidate");
});

test("blocks stale candidates that are not bound to the live PR head", () => {
  const verdict = compileScheduledTerminalActionOrder(
    input({
      candidates: [
        {
          candidate_id: "stale-embodiment",
          kind: "external_platform_embodiment",
          branch: "monday-platform-genesis-01",
          head_sha: "old-head",
          evidence: ["candidate planned before live metadata readback"],
          changed_files: ["platform/packages/route-governor/src/stale.ts"],
          behavior_exports: ["stale"],
          routing_effects: ["stale routing"],
        },
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_candidate_head");
});

test("admits fresh status only when a moved head or new current-head checks earn it", () => {
  const verdict = compileScheduledTerminalActionOrder(
    input({
      previous_status_head_sha: "live-head",
      candidates: [
        {
          candidate_id: "fresh-status-with-new-checks",
          kind: "fresh_status_readback",
          branch: "monday-platform-genesis-01",
          head_sha: "live-head",
          evidence: ["new check run appeared on current head"],
          check_run_ids: ["27049699999"],
        },
      ],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_fresh_status_readback");
});

test("blocks unearned fresh status readback when nothing changed", () => {
  const verdict = compileScheduledTerminalActionOrder(
    input({
      previous_status_head_sha: "live-head",
      candidates: [
        {
          candidate_id: "unearned-status",
          kind: "fresh_status_readback",
          branch: "monday-platform-genesis-01",
          head_sha: "live-head",
          evidence: ["same status surface repeated"],
          check_run_ids: [],
        },
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_unearned_status_readback");
});

test("admits an exact blocker only when the blocker text is present", () => {
  const verdict = compileScheduledTerminalActionOrder(
    input({
      candidates: [
        {
          candidate_id: "exact-blocker",
          kind: "exact_external_blocker",
          branch: "monday-platform-genesis-01",
          head_sha: "live-head",
          evidence: ["external write API unavailable"],
          exact_blocker: "GitHub contents write surface rejected branch mutation",
        },
      ],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "emit_exact_external_blocker");
  assert.deepEqual(verdict.blockers, ["GitHub contents write surface rejected branch mutation"]);
});

test("blocks incomplete embodiment candidates", () => {
  const verdict = compileScheduledTerminalActionOrder(
    input({
      candidates: [
        {
          candidate_id: "incomplete-embodiment",
          kind: "external_platform_embodiment",
          branch: "monday-platform-genesis-01",
          head_sha: "live-head",
          evidence: ["only test file changed"],
          changed_files: ["platform/packages/route-governor/src/scheduled-terminal-action-order.test.ts"],
          behavior_exports: [],
          routing_effects: [],
        },
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_embodiment");
  assert.match(verdict.blockers.join("\n"), /no behavior-bearing platform file/);
});
