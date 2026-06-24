import assert from "node:assert/strict";

import { compileProcessorQuorum, type ProcessorQuorumDispatch, type ProcessorQuorumResult } from "./processor-quorum.js";

const dispatches: ProcessorQuorumDispatch[] = [
  { processor_id: "loading-20:processor:1", load_id: "reentry" },
  { processor_id: "loading-20:processor:2", load_id: "truth" },
  { processor_id: "loading-20:processor:3", load_id: "act" },
];

const convergedResults: ProcessorQuorumResult[] = dispatches.map((dispatch) => ({
  ...dispatch,
  completed: true,
  output_class: dispatch.load_id === "act" ? "external_act" : "route_attack",
  output: dispatch.load_id === "act" ? "commit processor fabric quorum compiler" : "no contradiction",
  blockers: [],
}));

const converged = compileProcessorQuorum({ scene_id: "loading-20-finalization", dispatches, results: convergedResults });
assert.equal(converged.ok, true);
assert.equal(converged.action, "emit_converged_external_act");
assert.equal(converged.accepted_output, "commit processor fabric quorum compiler");
assert.deepEqual(converged.blockers, []);

const missing = compileProcessorQuorum({
  scene_id: "loading-20-finalization",
  dispatches,
  results: convergedResults.slice(0, 2),
});
assert.equal(missing.ok, false);
assert.equal(missing.action, "block_missing_processor_result");
assert.deepEqual(missing.blockers, ["missing result for loading-20:processor:3/act"]);

const blocker = compileProcessorQuorum({
  scene_id: "loading-20-finalization",
  dispatches,
  results: convergedResults.map((result) =>
    result.load_id === "act"
      ? { ...result, output_class: "exact_blocker", output: "external branch write surface unavailable" }
      : result,
  ),
});
assert.equal(blocker.ok, false);
assert.equal(blocker.action, "emit_exact_blocker");
assert.equal(blocker.accepted_output, "external branch write surface unavailable");

const conflict = compileProcessorQuorum({
  scene_id: "loading-20-finalization",
  dispatches,
  results: convergedResults.map((result) =>
    result.load_id === "truth"
      ? { ...result, output_class: "external_act", output: "different external act" }
      : result,
  ),
});
assert.equal(conflict.ok, false);
assert.equal(conflict.action, "block_conflicting_external_acts");
