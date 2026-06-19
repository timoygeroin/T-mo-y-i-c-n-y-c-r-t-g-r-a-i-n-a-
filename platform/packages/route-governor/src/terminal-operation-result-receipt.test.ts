import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  compileTerminalOperationResultReceipt,
  type TerminalOperationResultReceiptInput,
} from "./terminal-operation-result-receipt.js";

const liveHead = "ec8e24508c5db7ad8588b11ca5d4221bb3642a38";

function baseInput(overrides: Partial<TerminalOperationResultReceiptInput> = {}): TerminalOperationResultReceiptInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    issued_lease_ids: ["terminal-lease-001"],
    spent_result_receipt_ids: [],
    receipt_id: "terminal-result-001",
    lease_id: "terminal-lease-001",
    branch: "monday-platform-genesis-01",
    head_sha: liveHead,
    leased_operation: "merge_live_head",
    completed_operation: "merge_live_head",
    outcome: "succeeded",
    result_evidence: ["merge command returned merged true"],
    blockers: [],
    followup_move_classes: [],
    ...overrides,
  };
}

describe("compileTerminalOperationResultReceipt", () => {
  it("accepts a terminal result bound to the issued lease and live head", () => {
    const verdict = compileTerminalOperationResultReceipt(baseInput());

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "accept_terminal_result_receipt");
    assert.equal(verdict.operation, "merge_live_head");
    assert.equal(verdict.head_sha, liveHead);
    assert.ok(verdict.decisive_evidence.includes("merge command returned merged true"));
  });

  it("blocks stale repaired-head receipts", () => {
    const verdict = compileTerminalOperationResultReceipt(
      baseInput({ head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_stale_head");
    assert.match(verdict.blockers.join("; "), /not live head/);
  });

  it("blocks unknown leases, reused receipts, and operation mismatches", () => {
    const unknownLease = compileTerminalOperationResultReceipt(baseInput({ lease_id: "missing-lease" }));
    assert.equal(unknownLease.ok, false);
    assert.equal(unknownLease.action, "block_unknown_lease");

    const reusedReceipt = compileTerminalOperationResultReceipt(
      baseInput({ spent_result_receipt_ids: ["terminal-result-001"] }),
    );
    assert.equal(reusedReceipt.ok, false);
    assert.equal(reusedReceipt.action, "block_reused_receipt");

    const mismatch = compileTerminalOperationResultReceipt(
      baseInput({ leased_operation: "request_review", completed_operation: "merge_live_head" }),
    );
    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.action, "block_operation_mismatch");
  });

  it("blocks bundled followup move classes", () => {
    const verdict = compileTerminalOperationResultReceipt(
      baseInput({ followup_move_classes: ["fresh_status_readback", "external_platform_embodiment"] }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_bundled_followup");
  });

  it("routes failed terminal results to exact repair without accepting progress", () => {
    const verdict = compileTerminalOperationResultReceipt(
      baseInput({
        completed_operation: "request_review",
        leased_operation: "request_review",
        outcome: "blocked",
        result_evidence: [],
        blockers: ["connected account cannot request review from itself"],
        followup_move_classes: ["exact_external_blocker"],
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "route_terminal_result_repair");
    assert.deepEqual(verdict.blockers, ["connected account cannot request review from itself"]);
    assert.match(verdict.next_route, /review-result blocker/);
  });

  it("requires evidence for success and blocker text for failed or blocked outcomes", () => {
    const success = compileTerminalOperationResultReceipt(baseInput({ result_evidence: [] }));
    assert.equal(success.ok, false);
    assert.equal(success.action, "block_missing_result_evidence");

    const failure = compileTerminalOperationResultReceipt(
      baseInput({ outcome: "failed", result_evidence: [], blockers: [] }),
    );
    assert.equal(failure.ok, false);
    assert.equal(failure.action, "block_missing_result_evidence");
  });
});
