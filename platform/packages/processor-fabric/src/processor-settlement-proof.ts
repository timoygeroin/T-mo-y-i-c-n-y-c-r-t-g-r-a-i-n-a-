import assert from "node:assert/strict";

import {
  settleProcessorFabricOutputs,
  type ProcessorSettlementDispatch,
  type ProcessorSettlementResult,
} from "./processor-settlement.js";

const dispatches: ProcessorSettlementDispatch[] = [
  { processor_id: "loading-20:processor:1", load_id: "reentry", required_output: "ledger_delta" },
  { processor_id: "loading-20:processor:2", load_id: "truth", required_output: "route_attack" },
  { processor_id: "loading-20:processor:3", load_id: "novelty", required_output: "candidate_mechanism" },
  { processor_id: "loading-20:processor:4", load_id: "act", required_output: "proof_pressure" },
];

const settledResults: ProcessorSettlementResult[] = [
  {
    processor_id: "loading-20:processor:1",
    load_id: "reentry",
    completed: true,
    output_class: "ledger_delta",
    output: "Loading 20 body re-entered",
    evidence: ["agent_files/savepoints/monday-loading-20.md"],
    blockers: [],
  },
  {
    processor_id: "loading-20:processor:2",
    load_id: "truth",
    completed: true,
    output_class: "route_attack",
    output: "no contradiction",
    evidence: ["agent_files/docs/monday-archive-source-certification.md"],
    blockers: [],
  },
  {
    processor_id: "loading-20:processor:3",
    load_id: "novelty",
    completed: true,
    output_class: "candidate_mechanism",
    output: "processor-settlement",
    evidence: ["platform/packages/processor-fabric/src/processor-settlement.ts"],
    blockers: [],
  },
  {
    processor_id: "loading-20:processor:4",
    load_id: "act",
    completed: true,
    output_class: "external_act",
    output: "commit processor fabric settlement gate",
    evidence: ["platform/packages/processor-fabric/src/processor-settlement-proof.ts"],
    blockers: [],
  },
];

const settled = settleProcessorFabricOutputs({
  scene_id: "loading-20-finalization",
  convergence_rule: "settle to exactly one external act or exact external blocker",
  dispatches,
  results: settledResults,
  exhausted_external_acts: ["metadata reread", "duplicate ci summary", "local memory guard"],
});
assert.equal(settled.ok, true);
assert.equal(settled.action, "settle_converged_external_act");
assert.equal(settled.accepted_output, "commit processor fabric settlement gate");
assert.equal(settled.blockers.length, 0);
assert.equal(settled.decisive_processors.length, 4);

const missing = settleProcessorFabricOutputs({
  scene_id: "loading-20-finalization",
  convergence_rule: "settle to exactly one external act or exact external blocker",
  dispatches,
  results: settledResults.slice(0, 3),
  exhausted_external_acts: [],
});
assert.equal(missing.ok, false);
assert.equal(missing.action, "block_missing_processor_result");
assert.deepEqual(missing.blockers, ["missing result for loading-20:processor:4/act"]);

const blocker = settleProcessorFabricOutputs({
  scene_id: "loading-20-finalization",
  convergence_rule: "settle to exactly one external act or exact external blocker",
  dispatches,
  results: settledResults.map((result) =>
    result.load_id === "act"
      ? { ...result, output_class: "exact_blocker", output: "external branch write authority unavailable" }
      : result,
  ),
  exhausted_external_acts: [],
});
assert.equal(blocker.ok, true);
assert.equal(blocker.action, "settle_exact_external_blocker");
assert.equal(blocker.accepted_output, "external branch write authority unavailable");

const unresolved = settleProcessorFabricOutputs({
  scene_id: "loading-20-finalization",
  convergence_rule: "settle to exactly one external act or exact external blocker",
  dispatches,
  results: settledResults.map((result) =>
    result.load_id === "truth"
      ? { ...result, output_class: "route_attack", output: "candidate repeats post-write status escrow" }
      : result,
  ),
  exhausted_external_acts: [],
});
assert.equal(unresolved.ok, false);
assert.equal(unresolved.action, "block_unresolved_processor_pressure");

const recycled = settleProcessorFabricOutputs({
  scene_id: "loading-20-finalization",
  convergence_rule: "settle to exactly one external act or exact external blocker",
  dispatches,
  results: settledResults,
  exhausted_external_acts: ["commit processor fabric settlement gate"],
});
assert.equal(recycled.ok, false);
assert.equal(recycled.action, "block_recycled_external_act");
