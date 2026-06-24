import test from "node:test";
import assert from "node:assert/strict";

import { planCapabilityFrontier, type CapabilityFrontierCandidate } from "./capability-frontier-planner.js";

const HEAD = "633b37559b97f22ea7d6b0d9b8f183a21d17f090";

function candidate(overrides: Partial<CapabilityFrontierCandidate> = {}): CapabilityFrontierCandidate {
  return {
    candidate_id: "runtime-runner",
    branch: "monday-platform-genesis-01",
    live_head_sha: HEAD,
    capability_axis: "runtime_execution",
    artifact_class: "capability-frontier-planner",
    executable_artifacts: ["planCapabilityFrontier"],
    routing_artifacts: ["capability frontier axis reservation"],
    proof_artifacts: ["capability-frontier-planner.test.ts"],
    decisive_weight: 10,
    ...overrides,
  };
}

test("selects an unspent capability axis over a higher-weight spent axis", () => {
  const verdict = planCapabilityFrontier({
    active_branch: "monday-platform-genesis-01",
    live_head_sha: HEAD,
    frontier_axes: ["runtime_execution", "source_routing"],
    spent_capability_axes: ["runtime_execution"],
    candidates: [
      candidate({ candidate_id: "spent-runtime", capability_axis: "runtime_execution", decisive_weight: 100 }),
      candidate({ candidate_id: "source-route", capability_axis: "source_routing", decisive_weight: 1 }),
    ],
  });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "select_frontier_axis");
  assert.equal(verdict.selected?.candidate_id, "source-route");
});

test("allows a spent-axis repeat only when every viable frontier candidate is spent", () => {
  const verdict = planCapabilityFrontier({
    active_branch: "monday-platform-genesis-01",
    live_head_sha: HEAD,
    frontier_axes: ["runtime_execution"],
    spent_capability_axes: ["runtime_execution"],
    candidates: [candidate()],
  });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "allow_exhausted_frontier_repeat");
  assert.equal(verdict.selected?.capability_axis, "runtime_execution");
});

test("rejects candidates outside the active branch, live head, or frontier axes", () => {
  const verdict = planCapabilityFrontier({
    active_branch: "monday-platform-genesis-01",
    live_head_sha: HEAD,
    frontier_axes: ["runtime_execution"],
    spent_capability_axes: [],
    candidates: [
      candidate({ candidate_id: "wrong-branch", branch: "main" }),
      candidate({ candidate_id: "wrong-head", live_head_sha: "old-head" }),
      candidate({ candidate_id: "outside-frontier", capability_axis: "status_readback" }),
    ],
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_no_frontier_candidate");
  assert.equal(verdict.rejected.length, 3);
});
