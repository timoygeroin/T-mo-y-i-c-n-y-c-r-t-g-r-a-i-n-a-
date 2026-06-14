import assert from "node:assert/strict";

import { routeGuardDensity, type GuardDensityRouterInput } from "./guard-density-router.js";

const branch = "monday-platform-genesis-01";
const head = "4ce58aa1ed031ef1f6b538c80a5fd66f5dbe0288";
const liveFailure = "Route governor proof surface / Run proof examples / exit 1";

function input(overrides: Partial<GuardDensityRouterInput> = {}): GuardDensityRouterInput {
  return {
    active_branch: branch,
    live_head_sha: head,
    recent_artifact_classes: [
      "scheduled-surface-reconciliation-router",
      "current-instruction-head-boundary",
      "finalization-terminal-progress-contract",
      "status-readback-authority-lease",
    ],
    max_guard_like_artifacts: 3,
    live_failure_signatures: [],
    candidate: {
      candidate_id: "runtime-capability-extension",
      candidate_class: "capability_extension",
      branch,
      base_head_sha: head,
      artifact_class: "runtime-capability-extension",
      changed_files: ["platform/packages/route-governor/src/runtime-capability.ts"],
      executable_artifacts: ["compileRuntimeCapability"],
      routing_artifacts: ["guard-heavy lineages must move into capability behavior"],
      proof_artifacts: ["dist/runtime-capability-proof.js"],
    },
    ...overrides,
  };
}

const capability = routeGuardDensity(input());
assert.equal(capability.ok, true);
assert.equal(capability.action, "admit_capability_extension");

const unboundGuard = routeGuardDensity(
  input({
    candidate: {
      candidate_id: "unbound-boundary",
      candidate_class: "guard_boundary",
      branch,
      base_head_sha: head,
      artifact_class: "another-status-boundary-guard",
      changed_files: ["platform/packages/route-governor/src/another-boundary.ts"],
      executable_artifacts: ["compileAnotherBoundary"],
      routing_artifacts: ["another guard would repeat the guard-heavy lineage"],
      proof_artifacts: ["dist/another-boundary-proof.js"],
    },
  }),
);
assert.equal(unboundGuard.ok, false);
assert.equal(unboundGuard.action, "block_guard_accumulation");

const failureBoundGuard = routeGuardDensity(
  input({
    live_failure_signatures: [liveFailure],
    candidate: {
      candidate_id: "failure-bound-boundary",
      candidate_class: "guard_boundary",
      branch,
      base_head_sha: head,
      artifact_class: "proof-failure-boundary",
      changed_files: ["platform/packages/route-governor/src/proof-failure-boundary.ts"],
      executable_artifacts: ["compileProofFailureBoundary"],
      routing_artifacts: ["guard exists only because a live failure signature exists"],
      proof_artifacts: ["dist/proof-failure-boundary-proof.js"],
      bound_failure_signature: liveFailure,
    },
  }),
);
assert.equal(failureBoundGuard.ok, true);
assert.equal(failureBoundGuard.action, "admit_failure_bound_guard");

console.log("guard density router proof passed");
