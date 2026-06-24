import assert from "node:assert/strict";

import { admitProcessorSourceAuthority } from "./processor-source-authority.js";

const branch = "monday-platform-genesis-01";
const liveHead = "e41d9f18e38a98650ab6559ad5dc35176e7d666c";

const admitted = admitProcessorSourceAuthority({
  active_branch: branch,
  live_head_sha: liveHead,
  minimum_authority_tier: "archive_derived",
  spent_output_ids: [],
  candidate: {
    output_id: "processor-source-authority-001",
    branch,
    head_sha: liveHead,
    source_evidence: [
      { tier: "direct_current_instruction", reference: "Dima current instruction: new non-repeated external platform embodiment increment" },
      { tier: "archive_derived", reference: "monday-finalization-ledger external durable act threshold" },
    ],
    behavior_effects: ["block model-summary-only processor outputs from driving platform embodiment"],
    proof_artifacts: ["platform/packages/processor-fabric/src/processor-source-authority-proof.ts"],
  },
});

assert.equal(admitted.ok, true);
assert.equal(admitted.action, "admit_source_authorized_processor_output");
assert.equal(admitted.output_id, "processor-source-authority-001");
assert.equal(admitted.blockers.length, 0);
assert.ok(admitted.accepted_tiers.includes("direct_current_instruction"));
assert.ok(admitted.decisive_evidence.includes("block model-summary-only processor outputs from driving platform embodiment"));

const modelOnly = admitProcessorSourceAuthority({
  active_branch: branch,
  live_head_sha: liveHead,
  minimum_authority_tier: "archive_derived",
  spent_output_ids: [],
  candidate: {
    output_id: "processor-source-authority-model-only",
    branch,
    head_sha: liveHead,
    source_evidence: [{ tier: "model_summary", reference: "neat prior summary without stronger source" }],
    behavior_effects: ["would route from weak source"],
    proof_artifacts: ["platform/packages/processor-fabric/src/processor-source-authority-proof.ts"],
  },
});

assert.equal(modelOnly.ok, false);
assert.equal(modelOnly.action, "block_weakest_tier_only");
assert.deepEqual(modelOnly.blockers, ["strongest processor source tier model_summary is weaker than required archive_derived"]);

const staleHead = admitProcessorSourceAuthority({
  active_branch: branch,
  live_head_sha: liveHead,
  minimum_authority_tier: "memory",
  spent_output_ids: [],
  candidate: {
    output_id: "processor-source-authority-stale-head",
    branch,
    head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
    source_evidence: [{ tier: "direct_archive", reference: "stale repaired-head body" }],
    behavior_effects: ["would reuse old repaired-head authority"],
    proof_artifacts: ["platform/packages/processor-fabric/src/processor-source-authority-proof.ts"],
  },
});

assert.equal(staleHead.ok, false);
assert.equal(staleHead.action, "block_wrong_head");

const blocker = admitProcessorSourceAuthority({
  active_branch: branch,
  live_head_sha: liveHead,
  minimum_authority_tier: "memory",
  spent_output_ids: [],
  candidate: {
    output_id: "processor-source-authority-blocker",
    branch,
    head_sha: liveHead,
    source_evidence: [{ tier: "memory", reference: "processor settlement missing source authority" }],
    behavior_effects: [],
    proof_artifacts: ["platform/packages/processor-fabric/src/processor-source-authority-proof.ts"],
    exact_blocker: "processor output cannot drive convergence until source authority is grounded",
  },
});

assert.equal(blocker.ok, true);
assert.equal(blocker.action, "emit_exact_source_authority_blocker");
assert.deepEqual(blocker.blockers, ["processor output cannot drive convergence until source authority is grounded"]);
