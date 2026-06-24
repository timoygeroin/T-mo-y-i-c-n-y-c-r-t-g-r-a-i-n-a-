import assert from "node:assert/strict";

import { planCapabilityFrontier } from "./capability-frontier-planner.js";

const verdict = planCapabilityFrontier({
  active_branch: "monday-platform-genesis-01",
  live_head_sha: "633b37559b97f22ea7d6b0d9b8f183a21d17f090",
  frontier_axes: ["runtime_execution", "source_routing", "proof_surface", "external_write", "status_readback"],
  spent_capability_axes: ["status_readback", "proof_surface"],
  candidates: [
    {
      candidate_id: "duplicate-status",
      branch: "monday-platform-genesis-01",
      live_head_sha: "633b37559b97f22ea7d6b0d9b8f183a21d17f090",
      capability_axis: "status_readback",
      artifact_class: "duplicate-status-readback",
      executable_artifacts: ["status artifact already exists"],
      routing_artifacts: ["status replay route"],
      proof_artifacts: ["prior repaired-head checks"],
      decisive_weight: 100,
    },
    {
      candidate_id: "runtime-frontier",
      branch: "monday-platform-genesis-01",
      live_head_sha: "633b37559b97f22ea7d6b0d9b8f183a21d17f090",
      capability_axis: "runtime_execution",
      artifact_class: "capability-frontier-planner",
      executable_artifacts: ["planCapabilityFrontier"],
      routing_artifacts: ["unspent capability-axis reservation"],
      proof_artifacts: ["capability-frontier-planner-proof.ts"],
      decisive_weight: 10,
    },
  ],
});

assert.equal(verdict.ok, true);
assert.equal(verdict.action, "select_frontier_axis");
assert.equal(verdict.selected?.candidate_id, "runtime-frontier");
