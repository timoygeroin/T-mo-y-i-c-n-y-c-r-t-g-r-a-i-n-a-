import test from "node:test";
import assert from "node:assert/strict";

import {
  reconcileInstructionHead,
  type InstructionHeadCandidate,
  type InstructionHeadReconciliationInput,
} from "./instruction-head-reconciliation.js";

const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "11b5cfa70a5783a29738326c1f2cf15f0f7dff99";

function embodiment(overrides: Partial<InstructionHeadCandidate> = {}): InstructionHeadCandidate {
  return {
    candidate_id: "instruction-head-reconciliation-embodiment",
    move_class: "external_platform_embodiment",
    changed_files: ["platform/packages/route-governor/src/instruction-head-reconciliation.ts"],
    behavior_artifacts: ["reconcileInstructionHead"],
    routing_artifacts: ["historical instruction head cannot override moved live PR head"],
    proof_artifacts: ["platform/packages/route-governor/src/instruction-head-reconciliation.test.ts"],
    check_run_ids: [],
    ...overrides,
  };
}

function input(overrides: Partial<InstructionHeadReconciliationInput> = {}): InstructionHeadReconciliationInput {
  return {
    active_branch: "monday-platform-genesis-01",
    instruction_head_sha: repairedHead,
    live_head_sha: liveHead,
    resolved_historical_heads: [repairedHead],
    prior_readback_head_sha: "b50b5f8019aa9b3ecaa141771d9e156388904f26",
    spent_check_run_ids: ["27049650678", "27049650677"],
    exhausted_move_classes: ["duplicate_status_readback", "metadata_reread", "duplicate_comment", "internal_memory_guard"],
    candidates: [embodiment()],
    ...overrides,
  };
}

test("selects executable embodiment when instruction names an old repaired head but live PR head moved", () => {
  const verdict = reconcileInstructionHead(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "select_external_embodiment");
  assert.equal(verdict.selected_candidate_id, "instruction-head-reconciliation-embodiment");
  assert.equal(verdict.live_head_sha, liveHead);
  assert.match(verdict.next_route, /do not consume repaired-head status/);
});

test("blocks incomplete embodiment before it can masquerade as progress", () => {
  const verdict = reconcileInstructionHead(
    input({
      candidates: [
        embodiment({
          changed_files: ["platform/packages/route-governor/src/instruction-head-reconciliation.test.ts"],
          behavior_artifacts: [],
        }),
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_embodiment");
  assert.ok(verdict.blockers.some((blocker) => blocker.includes("behavior-bearing")));
});

test("allows fresh status only when it carries unspent check-run ids for a moved head", () => {
  const verdict = reconcileInstructionHead(
    input({
      candidates: [
        {
          candidate_id: "fresh-live-head-checks",
          move_class: "fresh_status_readback",
          changed_files: [],
          behavior_artifacts: [],
          routing_artifacts: ["moved-head readback delta"],
          proof_artifacts: [],
          check_run_ids: ["new-check-run-01"],
        },
      ],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "select_fresh_status_readback");
  assert.deepEqual(verdict.blockers, []);
});

test("blocks duplicate readback when the head has not moved since prior readback", () => {
  const verdict = reconcileInstructionHead(
    input({
      live_head_sha: "prior-head",
      prior_readback_head_sha: "prior-head",
      candidates: [
        {
          candidate_id: "duplicate-readback",
          move_class: "fresh_status_readback",
          changed_files: [],
          behavior_artifacts: [],
          routing_artifacts: ["readback replay"],
          proof_artifacts: [],
          check_run_ids: ["new-check-run-01"],
        },
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_check_delta");
  assert.ok(verdict.blockers.some((blocker) => blocker.includes("already had readback")));
});

test("blocks historical instruction head when no valid candidate exists", () => {
  const verdict = reconcileInstructionHead(input({ candidates: [] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_historical_instruction_head");
  assert.ok(verdict.blockers.some((blocker) => blocker.includes("resolved historical head")));
});
