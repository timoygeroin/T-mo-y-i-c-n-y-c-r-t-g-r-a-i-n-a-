import test from "node:test";
import assert from "node:assert/strict";

import {
  consumeFinalReviewCommand,
  type FinalReviewCommandAuthority,
  type FinalReviewCommandConsumptionInput,
} from "./final-review-command-consumption.js";

const branch = "monday-platform-genesis-01";
const head = "9c4cb5c4d5ec8ad3c20d8827da457154513d2cb6";

function authority(overrides: Partial<FinalReviewCommandAuthority> = {}): FinalReviewCommandAuthority {
  return {
    authority_id: "final-review-authority-001",
    branch,
    head_sha: head,
    command: "request_final_review",
    ok: true,
    evidence: ["status lease", "mergeability lease", "review lease", "blocker retirement lease"],
    blockers: [],
    warnings: ["Node.js 20 Actions deprecation notice"],
    ...overrides,
  };
}

function input(overrides: Partial<FinalReviewCommandConsumptionInput> = {}): FinalReviewCommandConsumptionInput {
  return {
    active_branch: branch,
    live_head_sha: head,
    command: "request_final_review",
    authority: authority(),
    receipt_id: "final-review-command-consumption-001",
    spent_receipt_ids: [],
    active_external_blockers: [],
    external_operation_id: "review-request-operation-001",
    external_operation_url: "https://github.com/timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-/pull/2",
    ...overrides,
  };
}

test("consumes admitted live-head final review command authority once", () => {
  const verdict = consumeFinalReviewCommand(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "consume_final_review_command");
  assert.equal(verdict.consumed_authority_id, "final-review-authority-001");
  assert.deepEqual(verdict.warnings, ["Node.js 20 Actions deprecation notice"]);
  assert.match(verdict.next_route, /fresh live-head readback/);
});

test("blocks command swaps against admitted authority", () => {
  const verdict = consumeFinalReviewCommand(input({ command: "merge_finalization" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_command_mismatch");
  assert.match(verdict.blockers[0], /admits request_final_review/);
});

test("blocks reused command receipts", () => {
  const receipt = "final-review-command-consumption-001";
  const verdict = consumeFinalReviewCommand(input({ receipt_id: receipt, spent_receipt_ids: [receipt] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_reused_receipt");
});

test("blocks stale repaired-head authority", () => {
  const verdict = consumeFinalReviewCommand(
    input({ authority: authority({ head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }) }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_head_mismatch");
  assert.match(verdict.blockers[0], /not live head/);
});

test("blocks non-progress commands", () => {
  const verdict = consumeFinalReviewCommand(input({ command: "metadata_reread" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_progress_command");
});

test("blocks active external blockers before command consumption", () => {
  const verdict = consumeFinalReviewCommand(
    input({ active_external_blockers: ["review request permission is unavailable"] }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_active_external_blocker");
});

test("requires a concrete external operation id", () => {
  const verdict = consumeFinalReviewCommand(input({ external_operation_id: "" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_external_operation");
});

test("emits exact external blocker without consuming command authority", () => {
  const verdict = consumeFinalReviewCommand(
    input({
      command: "exact_external_blocker",
      exact_blocker: "GitHub review request operation is unavailable to this actor",
      external_operation_id: "",
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "emit_exact_external_blocker");
  assert.equal(verdict.consumed_authority_id, null);
  assert.deepEqual(verdict.blockers, ["GitHub review request operation is unavailable to this actor"]);
});
