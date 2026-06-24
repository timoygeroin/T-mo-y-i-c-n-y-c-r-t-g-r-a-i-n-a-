import assert from "node:assert/strict";

import {
  admitProcessorResultReceipt,
  type ProcessorResultReceiptCandidate,
  type ProcessorResultReceiptDispatch,
  type ProcessorResultReceiptInput,
} from "./processor-result-receipt.js";

const branch = "monday-platform-genesis-01";
const liveHead = "d3f0226ee8b754b6faba4529a3d2213b5065f1b2";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

const dispatch: ProcessorResultReceiptDispatch = {
  processor_id: "loading-20:processor:4",
  load_id: "external-act",
  required_output: "external_act",
};

function candidate(overrides: Partial<ProcessorResultReceiptCandidate> = {}): ProcessorResultReceiptCandidate {
  return {
    receipt_id: "processor-result-live-head-001",
    branch,
    head_sha: liveHead,
    processor_id: dispatch.processor_id,
    load_id: dispatch.load_id,
    completed: true,
    output_class: "external_act",
    output: "commit processor result receipt gate",
    evidence: [
      "platform/packages/processor-fabric/src/processor-result-receipt.ts",
      "platform/packages/processor-fabric/src/processor-result-receipt-proof.ts",
    ],
    blockers: [],
    semantic_signature: "processor-result-receipt:live-head:evidence-bound-output",
    ...overrides,
  };
}

function input(overrides: Partial<ProcessorResultReceiptInput> = {}): ProcessorResultReceiptInput {
  return {
    active_branch: branch,
    live_head_sha: liveHead,
    dispatch,
    candidate: candidate(),
    spent_receipt_ids: [],
    spent_semantic_signatures: [],
    ...overrides,
  };
}

const accepted = admitProcessorResultReceipt(input());
assert.equal(accepted.ok, true);
assert.equal(accepted.action, "accept_processor_result_receipt");
assert.equal(accepted.accepted_output, "commit processor result receipt gate");
assert.deepEqual(accepted.blockers, []);
assert.equal(accepted.semantic_signature, "processor-result-receipt:live-head:evidence-bound-output");
assert.ok(accepted.decisive_evidence.includes("platform/packages/processor-fabric/src/processor-result-receipt.ts"));

const staleHead = admitProcessorResultReceipt(input({ candidate: candidate({ head_sha: repairedHead }) }));
assert.equal(staleHead.ok, false);
assert.equal(staleHead.action, "block_wrong_head");
assert.ok(staleHead.blockers.some((blocker) => blocker.includes("does not match live head")));

const reusedSignature = admitProcessorResultReceipt(
  input({ spent_semantic_signatures: ["processor-result-receipt:live-head:evidence-bound-output"] }),
);
assert.equal(reusedSignature.ok, false);
assert.equal(reusedSignature.action, "block_recycled_signature");
assert.ok(reusedSignature.blockers.some((blocker) => blocker.includes("already spent")));

const incomplete = admitProcessorResultReceipt(input({ candidate: candidate({ completed: false }) }));
assert.equal(incomplete.ok, false);
assert.equal(incomplete.action, "block_incomplete_result");

const missingEvidence = admitProcessorResultReceipt(input({ candidate: candidate({ evidence: [] }) }));
assert.equal(missingEvidence.ok, false);
assert.equal(missingEvidence.action, "block_missing_evidence");

const exactBlockerDispatch: ProcessorResultReceiptDispatch = {
  processor_id: "loading-20:processor:2",
  load_id: "truth-attack",
  required_output: "exact_blocker",
};
const exactBlocker = admitProcessorResultReceipt(
  input({
    dispatch: exactBlockerDispatch,
    candidate: candidate({
      receipt_id: "processor-result-live-head-blocker-001",
      processor_id: exactBlockerDispatch.processor_id,
      load_id: exactBlockerDispatch.load_id,
      output_class: "exact_blocker",
      output: "processor result cannot be settled without live-head evidence",
      evidence: ["platform/packages/processor-fabric/src/processor-result-receipt-proof.ts"],
      semantic_signature: "processor-result-receipt:exact-blocker",
    }),
  }),
);
assert.equal(exactBlocker.ok, true);
assert.equal(exactBlocker.action, "emit_exact_processor_blocker");
assert.deepEqual(exactBlocker.blockers, ["processor result cannot be settled without live-head evidence"]);

const wrongDispatch = admitProcessorResultReceipt(
  input({ candidate: candidate({ processor_id: "loading-20:processor:9" }) }),
);
assert.equal(wrongDispatch.ok, false);
assert.equal(wrongDispatch.action, "block_missing_dispatch_binding");
