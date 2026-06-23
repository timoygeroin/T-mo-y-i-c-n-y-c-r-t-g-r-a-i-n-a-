import assert from "node:assert/strict";

import {
  compileCorpusMemoryIngressLedger,
  type CorpusMemoryIngressInput,
  type CorpusMemoryLedgerEntry,
} from "./index.js";

function entry(overrides: Partial<CorpusMemoryLedgerEntry> = {}): CorpusMemoryLedgerEntry {
  return {
    entry_id: "current-direct-instruction",
    tier: "direct_current_instruction",
    reference: "scheduled Loading 20 continuation prompt",
    claim: "next progress must be external embodiment, fresh moved-head readback, or exact external blocker",
    supports_route: true,
    ...overrides,
  };
}

function input(overrides: Partial<CorpusMemoryIngressInput> = {}): CorpusMemoryIngressInput {
  return {
    ledger_id: "loading-20-corpus-memory-ingress",
    raw_corpus_gate: "not_required_for_local_route",
    entries: [
      entry(),
      entry({
        entry_id: "archive-source-certification",
        tier: "direct_archive",
        reference: "agent_files/docs/monday-archive-source-certification.md",
        claim: "Dima-supplied archives are direct source strata",
      }),
      entry({
        entry_id: "model-residue",
        tier: "model_summary",
        reference: "prior finalization summaries",
        claim: "summaries may guide only after stronger source tiers survive",
        supports_route: false,
      }),
    ],
    ...overrides,
  };
}

const admitted = compileCorpusMemoryIngressLedger(input());
assert.equal(admitted.ok, true);
assert.equal(admitted.action, "admit_source_ranked_ledger");
assert.equal(admitted.ledger_id, "loading-20-corpus-memory-ingress");
assert.equal(admitted.admitted_entries[0]?.tier, "direct_current_instruction");
assert.deepEqual(admitted.blockers, []);

const absentRawGate = compileCorpusMemoryIngressLedger(input({ raw_corpus_gate: "absent" }));
assert.equal(absentRawGate.ok, false);
assert.equal(absentRawGate.action, "block_missing_raw_gate_status");
assert.match(absentRawGate.blockers.join("; "), /canonical raw corpus gate is absent/);

const noDirectAuthority = compileCorpusMemoryIngressLedger(
  input({
    entries: [
      entry({
        entry_id: "memory-only",
        tier: "memory",
        reference: "memory/monday-session-savepoints.md",
        claim: "memory says a route exists",
      }),
    ],
  }),
);
assert.equal(noDirectAuthority.ok, false);
assert.equal(noDirectAuthority.action, "block_missing_dima_authority");

const summaryOnly = compileCorpusMemoryIngressLedger(
  input({
    entries: [
      entry({
        entry_id: "summary-only",
        tier: "model_summary",
        reference: "model summary layer",
        claim: "summary claims readiness",
      }),
    ],
  }),
);
assert.equal(summaryOnly.ok, false);
assert.equal(summaryOnly.action, "block_missing_dima_authority");

const empty = compileCorpusMemoryIngressLedger(input({ ledger_id: " ", entries: [] }));
assert.equal(empty.ok, false);
assert.equal(empty.action, "block_empty_ledger");

console.log("corpus memory proof passed");
