import assert from "node:assert/strict";
import test from "node:test";
import { compileFinalizationRunReceipt, type FinalizationRunReceiptInput } from "./finalization-run-receipt.js";

function baseInput(overrides: Partial<FinalizationRunReceiptInput> = {}): FinalizationRunReceiptInput {
  return {
    run_id: "run-13aa-finalization-receipt",
    active_branch: "monday-platform-genesis-01",
    live_head_sha: "13aa1491804b2b40734c7b71a3efaaac2b9c5f55",
    instruction_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
    resolved_historical_heads: ["b38ea247602ae8ebba80c4120ad03b41b26bd841"],
    source_tiers: ["direct_current_instruction", "live_pr_metadata", "memory_receipt"],
    prohibited_move_classes: ["duplicate_ci_summary", "pr_metadata_reread", "local_memory_guard"],
    spent_artifact_classes: ["post-status-embodiment-queue", "status-readback-authority-lease"],
    progress: {
      move_class: "external_platform_embodiment",
      artifact_class: "finalization-run-receipt",
      branch: "monday-platform-genesis-01",
      base_head_sha: "13aa1491804b2b40734c7b71a3efaaac2b9c5f55",
      resulting_head_sha: "next-head",
      next_status_expected_head_sha: "next-head",
      changed_files: ["platform/packages/route-governor/src/finalization-run-receipt.ts"],
      executable_artifacts: ["compileFinalizationRunReceipt"],
      routing_artifacts: ["finalization run receipt compiler"],
      proof_artifacts: ["platform/packages/route-governor/src/finalization-run-receipt-proof.ts"],
      status_surface_ids: [],
    },
    ...overrides,
  };
}

test("accepts moved-head external embodiment run receipts", () => {
  const verdict = compileFinalizationRunReceipt(baseInput());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "accept_external_embodiment_run");
  assert.equal(verdict.run_id, "run-13aa-finalization-receipt");
  assert.equal(verdict.quarantined_instruction_head_sha, "b38ea247602ae8ebba80c4120ad03b41b26bd841");
  assert.deepEqual(verdict.blockers, []);
});

test("blocks run receipts without direct current instruction source", () => {
  const verdict = compileFinalizationRunReceipt(
    baseInput({
      source_tiers: ["live_pr_metadata", "memory_receipt"],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_source_gap");
  assert.ok(verdict.blockers.some((blocker) => blocker.includes("direct current instruction")));
});

test("blocks stale base heads before accepting progress", () => {
  const verdict = compileFinalizationRunReceipt(
    baseInput({
      progress: {
        ...baseInput().progress,
        base_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_base_head");
});

test("blocks repeated artifact classes", () => {
  const verdict = compileFinalizationRunReceipt(
    baseInput({
      progress: {
        ...baseInput().progress,
        artifact_class: "post-status-embodiment-queue",
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_repeated_artifact_class");
});

test("blocks external embodiment receipts that do not move the head", () => {
  const verdict = compileFinalizationRunReceipt(
    baseInput({
      progress: {
        ...baseInput().progress,
        resulting_head_sha: "13aa1491804b2b40734c7b71a3efaaac2b9c5f55",
        next_status_expected_head_sha: "13aa1491804b2b40734c7b71a3efaaac2b9c5f55",
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_unmoved_external_embodiment");
});

test("requires direct status source for fresh status readback receipts", () => {
  const verdict = compileFinalizationRunReceipt(
    baseInput({
      progress: {
        ...baseInput().progress,
        move_class: "fresh_status_readback",
        resulting_head_sha: "13aa1491804b2b40734c7b71a3efaaac2b9c5f55",
        next_status_expected_head_sha: undefined,
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: ["platform/packages/route-governor/src/finalization-run-receipt-proof.ts"],
        status_surface_ids: ["checks:27049651460"],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_source_gap");
});

test("accepts exact blocker run receipts only with blocker text", () => {
  const accepted = compileFinalizationRunReceipt(
    baseInput({
      progress: {
        ...baseInput().progress,
        move_class: "exact_external_blocker",
        resulting_head_sha: "13aa1491804b2b40734c7b71a3efaaac2b9c5f55",
        next_status_expected_head_sha: undefined,
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
        status_surface_ids: [],
        blocker: "writable GitHub contents surface unavailable",
      },
    }),
  );

  assert.equal(accepted.ok, true);
  assert.equal(accepted.action, "accept_exact_blocker_run");

  const blocked = compileFinalizationRunReceipt(
    baseInput({
      progress: {
        ...baseInput().progress,
        move_class: "exact_external_blocker",
        resulting_head_sha: "13aa1491804b2b40734c7b71a3efaaac2b9c5f55",
        next_status_expected_head_sha: undefined,
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
        status_surface_ids: [],
      },
    }),
  );

  assert.equal(blocked.ok, false);
  assert.equal(blocked.action, "block_incomplete_run_receipt");
});
