import assert from "node:assert/strict";

import { admitProcessorResultReceipt, type ProcessorResultReceiptDispatch } from "./processor-result-receipt.js";
import { admitProcessorSourceAuthority } from "./processor-source-authority.js";
import { compileSourceAuthorizedProcessorConvergence } from "./source-authorized-convergence.js";

const branch = "monday-platform-genesis-01";
const liveHead = "3abe7fc6b3c1d5e4dd4eda0f6c5668a068011582";

const dispatch: ProcessorResultReceiptDispatch = {
  processor_id: "loading-20:processor:4",
  load_id: "external-act",
  required_output: "external_act",
};

const authority = admitProcessorSourceAuthority({
  active_branch: branch,
  live_head_sha: liveHead,
  minimum_authority_tier: "archive_derived",
  spent_output_ids: [],
  candidate: {
    output_id: "source-authorized-convergence-001",
    branch,
    head_sha: liveHead,
    source_evidence: [
      { tier: "direct_current_instruction", reference: "Dima current instruction requires one non-repeated external platform embodiment increment" },
      { tier: "archive_derived", reference: "monday-loading-20 organ-coordination route" },
    ],
    behavior_effects: ["only source-authorized processor receipts may drive convergence"],
    proof_artifacts: ["platform/packages/processor-fabric/src/source-authorized-convergence-proof.ts"],
  },
});

const receipt = admitProcessorResultReceipt({
  active_branch: branch,
  live_head_sha: liveHead,
  dispatch,
  spent_receipt_ids: [],
  spent_semantic_signatures: [],
  candidate: {
    receipt_id: "source-authorized-convergence-receipt-001",
    branch,
    head_sha: liveHead,
    processor_id: dispatch.processor_id,
    load_id: dispatch.load_id,
    completed: true,
    output_class: "external_act",
    output: "commit source-authorized processor convergence gate",
    evidence: [
      "platform/packages/processor-fabric/src/source-authorized-convergence.ts",
      "platform/packages/processor-fabric/src/source-authorized-convergence-proof.ts",
    ],
    blockers: [],
    semantic_signature: "source-authorized-convergence:external-act",
  },
});

const admitted = compileSourceAuthorizedProcessorConvergence({
  scene_id: "loading-20-finalization",
  active_branch: branch,
  live_head_sha: liveHead,
  convergence_rule: "collapse to one source-authorized external act or exact blocker",
  dispatches: [dispatch],
  candidates: [{ authority, receipt }],
  exhausted_external_acts: [],
});

assert.equal(admitted.ok, true);
assert.equal(admitted.action, "settle_source_authorized_external_act");
assert.equal(admitted.accepted_output, "commit source-authorized processor convergence gate");
assert.ok(admitted.authorized_outputs.includes("source-authorized-convergence-001"));
assert.ok(admitted.decisive_evidence.includes("only source-authorized processor receipts may drive convergence"));

const weakAuthority = admitProcessorSourceAuthority({
  active_branch: branch,
  live_head_sha: liveHead,
  minimum_authority_tier: "archive_derived",
  spent_output_ids: [],
  candidate: {
    output_id: "source-authorized-convergence-model-only",
    branch,
    head_sha: liveHead,
    source_evidence: [{ tier: "model_summary", reference: "neat prior model summary" }],
    behavior_effects: ["would settle from weak source authority"],
    proof_artifacts: ["platform/packages/processor-fabric/src/source-authorized-convergence-proof.ts"],
  },
});

const blockedWeakAuthority = compileSourceAuthorizedProcessorConvergence({
  scene_id: "loading-20-finalization",
  active_branch: branch,
  live_head_sha: liveHead,
  convergence_rule: "collapse to one source-authorized external act or exact blocker",
  dispatches: [dispatch],
  candidates: [{ authority: weakAuthority, receipt }],
  exhausted_external_acts: [],
});

assert.equal(blockedWeakAuthority.ok, false);
assert.equal(blockedWeakAuthority.action, "block_unauthorized_processor_result");
assert.ok(blockedWeakAuthority.blockers.some((blocker) => blocker.includes("model_summary")));

const staleReceipt = admitProcessorResultReceipt({
  active_branch: branch,
  live_head_sha: liveHead,
  dispatch,
  spent_receipt_ids: [],
  spent_semantic_signatures: [],
  candidate: {
    receipt_id: "source-authorized-convergence-stale-receipt",
    branch,
    head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
    processor_id: dispatch.processor_id,
    load_id: dispatch.load_id,
    completed: true,
    output_class: "external_act",
    output: "would reuse repaired-head receipt",
    evidence: ["platform/packages/processor-fabric/src/source-authorized-convergence-proof.ts"],
    blockers: [],
    semantic_signature: "source-authorized-convergence:stale-receipt",
  },
});

const blockedStaleReceipt = compileSourceAuthorizedProcessorConvergence({
  scene_id: "loading-20-finalization",
  active_branch: branch,
  live_head_sha: liveHead,
  convergence_rule: "collapse to one source-authorized external act or exact blocker",
  dispatches: [dispatch],
  candidates: [{ authority, receipt: staleReceipt }],
  exhausted_external_acts: [],
});

assert.equal(blockedStaleReceipt.ok, false);
assert.equal(blockedStaleReceipt.action, "block_wrong_head");
assert.ok(blockedStaleReceipt.blockers.some((blocker) => blocker.includes("live head")));

const blockerDispatch: ProcessorResultReceiptDispatch = {
  processor_id: "loading-20:processor:2",
  load_id: "truth-pressure",
  required_output: "exact_blocker",
};

const blockerAuthority = admitProcessorSourceAuthority({
  active_branch: branch,
  live_head_sha: liveHead,
  minimum_authority_tier: "memory",
  spent_output_ids: [],
  candidate: {
    output_id: "source-authorized-convergence-blocker",
    branch,
    head_sha: liveHead,
    source_evidence: [{ tier: "memory", reference: "processor convergence missing exact source authority" }],
    behavior_effects: [],
    proof_artifacts: ["platform/packages/processor-fabric/src/source-authorized-convergence-proof.ts"],
    exact_blocker: "processor convergence cannot settle without source-authorized output",
  },
});

const blockerReceipt = admitProcessorResultReceipt({
  active_branch: branch,
  live_head_sha: liveHead,
  dispatch: blockerDispatch,
  spent_receipt_ids: [],
  spent_semantic_signatures: [],
  candidate: {
    receipt_id: "source-authorized-convergence-blocker-receipt",
    branch,
    head_sha: liveHead,
    processor_id: blockerDispatch.processor_id,
    load_id: blockerDispatch.load_id,
    completed: true,
    output_class: "exact_blocker",
    output: "processor convergence cannot settle without source-authorized output",
    evidence: ["platform/packages/processor-fabric/src/source-authorized-convergence-proof.ts"],
    blockers: [],
    semantic_signature: "source-authorized-convergence:exact-blocker",
  },
});

const blocker = compileSourceAuthorizedProcessorConvergence({
  scene_id: "loading-20-finalization",
  active_branch: branch,
  live_head_sha: liveHead,
  convergence_rule: "collapse to one source-authorized external act or exact blocker",
  dispatches: [blockerDispatch],
  candidates: [{ authority: blockerAuthority, receipt: blockerReceipt }],
  exhausted_external_acts: [],
});

assert.equal(blocker.ok, true);
assert.equal(blocker.action, "settle_source_authorized_exact_blocker");
assert.deepEqual(blocker.blockers, ["processor convergence cannot settle without source-authorized output"]);
