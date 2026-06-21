import test from "node:test";
import assert from "node:assert/strict";

import { compileExternalActContinuity, type ExternalActContinuityInput } from "./external-act-continuity-compiler.js";

const liveHead = "69e3bf73761dbeedcb3f0b83a7fe1a12c8546401";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function input(overrides: Partial<ExternalActContinuityInput> = {}): ExternalActContinuityInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    resolved_head_shas: [repairedHead],
    exhausted_move_classes: ["duplicate_ci_summary", "repaired_head_status_readback"],
    candidate: {
      candidate_id: "external-act-continuity-compiler",
      branch: "monday-platform-genesis-01",
      head_sha: liveHead,
      move_class: "continuity_bound_external_act_compilation",
      changed_files: ["platform/packages/route-governor/src/external-act-continuity-compiler.ts"],
      behavior_exports: ["compileExternalActContinuity"],
      future_routing_effects: ["resolved repaired heads cannot be reused as blockers or progress"],
    },
    ...overrides,
  };
}

test("admits a live-head executable external act candidate", () => {
  const verdict = compileExternalActContinuity(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "compile_external_act");
  assert.deepEqual(verdict.blockers, []);
  assert.ok(verdict.decisive_evidence.includes("compileExternalActContinuity"));
});

test("blocks replaying the resolved repaired-head status boundary", () => {
  const verdict = compileExternalActContinuity(
    input({
      candidate: {
        ...input().candidate,
        head_sha: repairedHead,
        move_class: "repaired_head_status_readback",
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_resolved_head_replay");
});

test("blocks duplicate CI summaries as spent move classes", () => {
  const verdict = compileExternalActContinuity(
    input({
      candidate: {
        ...input().candidate,
        move_class: "duplicate_ci_summary",
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_spent_move_class");
});

test("blocks non-executable documentation-only candidates", () => {
  const verdict = compileExternalActContinuity(
    input({
      candidate: {
        ...input().candidate,
        changed_files: ["platform/docs/status-summary.md"],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_executable_candidate");
});
