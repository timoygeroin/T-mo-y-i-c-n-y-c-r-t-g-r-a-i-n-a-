import assert from "node:assert/strict";
import test from "node:test";

import {
  lockScheduledTerminalOperation,
  type ScheduledTerminalOperationLockInput,
} from "./scheduled-terminal-operation-lock.js";

const liveHead = "83f4dec1aaa09c543f5477c40d5b7fa5416799d0";
const branch = "monday-platform-genesis-01";

function baseInput(overrides: Partial<ScheduledTerminalOperationLockInput> = {}): ScheduledTerminalOperationLockInput {
  return {
    invocation_id: "scheduled-2026-06-21T06-04-idt",
    active_branch: branch,
    live_head_sha: liveHead,
    previous_status_head_sha: "3bf8e07dce32e59accf776357fb22278f57ba3f5",
    previous_invocation_ids: [],
    spent_operation_ids: [],
    repaired_historical_heads: ["b38ea247602ae8ebba80c4120ad03b41b26bd841"],
    operations: [
      {
        operation_id: "scheduled-terminal-operation-lock",
        operation_class: "external_platform_embodiment",
        branch,
        base_head_sha: liveHead,
        changed_files: ["platform/packages/route-governor/src/scheduled-terminal-operation-lock.ts"],
        behavior_artifacts: ["lockScheduledTerminalOperation"],
        routing_artifacts: ["next_required_authority"],
        proof_artifacts: ["scheduled-terminal-operation-lock-proof"],
        status_surface_ids: [],
        expected_result_head_sha: "next-head",
      },
    ],
    ...overrides,
  };
}

test("admits one behavior-bearing scheduled embodiment and binds the next authority to the moved head", () => {
  const verdict = lockScheduledTerminalOperation(baseInput());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_single_external_embodiment");
  assert.equal(verdict.selected_operation_id, "scheduled-terminal-operation-lock");
  assert.deepEqual(verdict.next_required_authority, { kind: "moved_head_status", head_sha: "next-head" });
  assert.match(verdict.next_route, /moved result head/);
});

test("blocks a scheduled invocation that bundles more than one terminal operation", () => {
  const input = baseInput({
    operations: [
      ...baseInput().operations,
      {
        ...baseInput().operations[0],
        operation_id: "duplicate-status-summary",
        operation_class: "duplicate_ci_summary",
      },
    ],
  });

  const verdict = lockScheduledTerminalOperation(input);

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_operation_bundle");
  assert.match(verdict.blockers[0], /exactly one terminal operation/);
});

test("blocks replayed invocation and spent operation ids", () => {
  const replayedInvocation = lockScheduledTerminalOperation(
    baseInput({ previous_invocation_ids: ["scheduled-2026-06-21T06-04-idt"] }),
  );
  assert.equal(replayedInvocation.ok, false);
  assert.equal(replayedInvocation.action, "block_replayed_invocation");

  const spentOperation = lockScheduledTerminalOperation(
    baseInput({ spent_operation_ids: ["scheduled-terminal-operation-lock"] }),
  );
  assert.equal(spentOperation.ok, false);
  assert.equal(spentOperation.action, "block_replayed_invocation");
});

test("blocks repaired-head and stale operation bases", () => {
  const repaired = lockScheduledTerminalOperation(
    baseInput({
      operations: [
        {
          ...baseInput().operations[0],
          base_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
        },
      ],
    }),
  );
  assert.equal(repaired.ok, false);
  assert.equal(repaired.action, "block_repaired_head_authority");

  const stale = lockScheduledTerminalOperation(
    baseInput({ operations: [{ ...baseInput().operations[0], base_head_sha: "older-head" }] }),
  );
  assert.equal(stale.ok, false);
  assert.equal(stale.action, "block_stale_operation_base");
});

test("blocks non-progress operations and proof-only embodiment", () => {
  const nonProgress = lockScheduledTerminalOperation(
    baseInput({ operations: [{ ...baseInput().operations[0], operation_class: "duplicate_comment" }] }),
  );
  assert.equal(nonProgress.ok, false);
  assert.equal(nonProgress.action, "block_non_progress_operation");

  const proofOnly = lockScheduledTerminalOperation(
    baseInput({
      operations: [
        {
          ...baseInput().operations[0],
          changed_files: ["platform/packages/route-governor/src/scheduled-terminal-operation-lock-proof.ts"],
        },
      ],
    }),
  );
  assert.equal(proofOnly.ok, false);
  assert.equal(proofOnly.action, "block_incomplete_embodiment");
});

test("admits only status readbacks with a moved head or named live-head status surface", () => {
  const moved = lockScheduledTerminalOperation(
    baseInput({
      operations: [
        {
          ...baseInput().operations[0],
          operation_class: "fresh_status_readback",
          status_surface_ids: [],
        },
      ],
    }),
  );
  assert.equal(moved.ok, true);
  assert.equal(moved.action, "admit_single_status_readback");

  const missingDelta = lockScheduledTerminalOperation(
    baseInput({
      previous_status_head_sha: liveHead,
      operations: [
        {
          ...baseInput().operations[0],
          operation_class: "fresh_status_readback",
          status_surface_ids: [],
        },
      ],
    }),
  );
  assert.equal(missingDelta.ok, false);
  assert.equal(missingDelta.action, "block_missing_status_delta");
});

test("admits one exact blocker only when blocker text is present", () => {
  const admitted = lockScheduledTerminalOperation(
    baseInput({
      operations: [
        {
          ...baseInput().operations[0],
          operation_class: "exact_external_blocker",
          blocker: "EXTERNAL_REVIEW_PERMISSION_MISSING",
        },
      ],
    }),
  );
  assert.equal(admitted.ok, true);
  assert.equal(admitted.action, "emit_single_exact_blocker");
  assert.deepEqual(admitted.next_required_authority, { kind: "blocker_resolution", head_sha: liveHead });

  const missing = lockScheduledTerminalOperation(
    baseInput({ operations: [{ ...baseInput().operations[0], operation_class: "exact_external_blocker" }] }),
  );
  assert.equal(missing.ok, false);
  assert.equal(missing.action, "block_missing_exact_blocker");
});
