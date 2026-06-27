import assert from "node:assert/strict";

import { compileCorpusMemoryIngressLedger, type CorpusMemoryIngressInput } from "./index.js";
import { compileSourceProofAuthorityBridge } from "./source-proof-authority-bridge.js";

const branch = "monday-platform-genesis-01";
const liveHead = "post-resolution-source-bridge-head";

function ledger(overrides: Partial<CorpusMemoryIngressInput> = {}) {
  return compileCorpusMemoryIngressLedger({
    ledger_id: "source-proof-authority-ledger",
    raw_corpus_gate: "not_required_for_local_route",
    entries: [
      {
        entry_id: "current-instruction",
        tier: "direct_current_instruction",
        reference: "Loading 20 scheduled prompt",
        claim: "next valid progress must be external embodiment, fresh moved-head readback, or exact external blocker",
        supports_route: true,
      },
      {
        entry_id: "archive-law",
        tier: "direct_archive",
        reference: "agent_files/docs/monday-archive-laws.md",
        claim: "archive pressure must outrank model summary residue",
        supports_route: true,
      },
    ],
    ...overrides,
  });
}

const admitted = compileSourceProofAuthorityBridge({
  proof_bundle_id: "source-ranked-proof-authority-bridge",
  branch,
  live_head_sha: liveHead,
  external_artifacts: [
    "platform/packages/corpus-memory/src/source-proof-authority-bridge.ts",
    "platform/packages/corpus-memory/src/source-proof-authority-bridge-proof.ts",
  ],
  ledger: ledger(),
  required_authorities: [
    "direct_current_instruction",
    "live_pr_head",
    "source_ranked_route",
    "proof_evaluation_record",
  ],
});

assert.equal(admitted.ok, true);
assert.equal(admitted.action, "compile_source_ranked_proof_authority");
assert.equal(admitted.proof_bundle_id, "source-ranked-proof-authority-bridge");
assert.deepEqual(admitted.blockers, []);
assert.ok(admitted.source_authority.includes("direct_current_instruction"));
assert.ok(admitted.source_authority.includes("live_pr_head"));
assert.ok(admitted.source_authority.includes("source_ranked_route"));
assert.ok(admitted.source_authority.includes("proof_evaluation_record"));
assert.match(admitted.next_route, /proof-evaluation input/);

const absentRawGate = compileSourceProofAuthorityBridge({
  proof_bundle_id: "absent-raw-gate",
  branch,
  live_head_sha: liveHead,
  external_artifacts: ["platform/packages/corpus-memory/src/source-proof-authority-bridge.ts"],
  ledger: ledger({ raw_corpus_gate: "absent" }),
  required_authorities: ["direct_current_instruction", "live_pr_head", "source_ranked_route"],
});
assert.equal(absentRawGate.ok, false);
assert.equal(absentRawGate.action, "block_unadmitted_source_ledger");
assert.match(absentRawGate.blockers.join("; "), /canonical raw corpus gate is absent/);

const summaryOnlyLedger = ledger({
  entries: [
    {
      entry_id: "summary-only",
      tier: "model_summary",
      reference: "model summary residue",
      claim: "summary claims the route is ready",
      supports_route: true,
    },
  ],
});
const summaryOnly = compileSourceProofAuthorityBridge({
  proof_bundle_id: "summary-only",
  branch,
  live_head_sha: liveHead,
  external_artifacts: ["platform/packages/corpus-memory/src/source-proof-authority-bridge.ts"],
  ledger: summaryOnlyLedger,
  required_authorities: ["direct_current_instruction", "live_pr_head", "source_ranked_route"],
});
assert.equal(summaryOnly.ok, false);
assert.equal(summaryOnly.action, "block_unadmitted_source_ledger");

const missingSurface = compileSourceProofAuthorityBridge({
  proof_bundle_id: "missing-surface",
  branch: "",
  live_head_sha: "",
  external_artifacts: [],
  ledger: ledger(),
  required_authorities: ["direct_current_instruction", "live_pr_head", "source_ranked_route"],
});
assert.equal(missingSurface.ok, false);
assert.equal(missingSurface.action, "block_missing_external_surface");

const missingBundle = compileSourceProofAuthorityBridge({
  proof_bundle_id: " ",
  branch,
  live_head_sha: liveHead,
  external_artifacts: ["platform/packages/corpus-memory/src/source-proof-authority-bridge.ts"],
  ledger: ledger(),
  required_authorities: ["direct_current_instruction"],
});
assert.equal(missingBundle.ok, false);
assert.equal(missingBundle.action, "block_missing_proof_bundle");

console.log("source proof authority bridge proof passed");
