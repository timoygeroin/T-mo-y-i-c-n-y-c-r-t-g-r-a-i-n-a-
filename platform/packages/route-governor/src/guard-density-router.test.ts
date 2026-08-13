import assert from "node:assert/strict";
import { test } from "node:test";

import { routeGuardDensity, type GuardDensityRouterInput } from "./guard-density-router.js";

const branch = "monday-platform-genesis-01";
const head = "4ce58aa1ed031ef1f6b538c80a5fd66f5dbe0288";
const failure = "Route governor proof surface / Run proof examples / exit 1";

function candidate(overrides: Partial<GuardDensityRouterInput["candidate"]> = {}): GuardDensityRouterInput["candidate"] {
  return {
    candidate_id: "capability-runtime-step",
    candidate_class: "capability_extension",
    branch,
    base_head_sha: head,
    artifact_class: "runtime-capability-extension",
    changed_files: ["platform/packages/route-governor/src/runtime-capability.ts"],
    executable_artifacts: ["compileRuntimeCapability"],
    routing_artifacts: ["guard-heavy lineages must move into capability behavior"],
    proof_artifacts: ["dist/runtime-capability-proof.js"],
    ...overrides,
  };
}

function input(overrides: Partial<GuardDensityRouterInput> = {}): GuardDensityRouterInput {
  return {
    active_branch: branch,
    live_head_sha: head,
    recent_artifact_classes: [
      "scheduled-surface-reconciliation-router",
      "current-instruction-head-boundary",
      "finalization-terminal-progress-gate",
      "status-readback-authority-policy",
    ],
    max_guard_like_artifacts: 3,
    live_failure_signatures: [],
    candidate: candidate(),
    ...overrides,
  };
}

test("admits capability extension when guard pressure is already high", () => {
  const verdict = routeGuardDensity(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_capability_extension");
  assert.equal(verdict.guard_like_count, 4);
  assert.deepEqual(verdict.blockers, []);
});

test("blocks another unbound guard when recent lineage is guard-heavy", () => {
  const verdict = routeGuardDensity(
    input({
      candidate: candidate({
        candidate_id: "another-boundary",
        candidate_class: "guard_boundary",
        artifact_class: "another-status-boundary-guard",
        changed_files: ["platform/packages/route-governor/src/another-boundary.ts"],
        executable_artifacts: ["compileAnotherBoundary"],
        routing_artifacts: ["another guard would not expand runtime capability"],
        proof_artifacts: ["dist/another-boundary-proof.js"],
      }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_guard_accumulation");
  assert.match(verdict.blockers.join("\n"), /guard-like artifact count 4 reached limit 3/);
});

test("admits a guard only when bound to a live failure signature", () => {
  const verdict = routeGuardDensity(
    input({
      live_failure_signatures: [failure],
      candidate: candidate({
        candidate_id: "failure-bound-boundary",
        candidate_class: "guard_boundary",
        artifact_class: "proof-failure-boundary",
        changed_files: ["platform/packages/route-governor/src/proof-failure-boundary.ts"],
        executable_artifacts: ["compileProofFailureBoundary"],
        routing_artifacts: ["guard exists only because a live failure signature exists"],
        proof_artifacts: ["dist/proof-failure-boundary-proof.js"],
        bound_failure_signature: failure,
      }),
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_failure_bound_guard");
  assert.ok(verdict.decisive_evidence.includes(failure));
});

test("requires failure repairs to cite live failure signatures", () => {
  const verdict = routeGuardDensity(
    input({
      candidate: candidate({
        candidate_id: "blind-repair",
        candidate_class: "failure_repair",
        artifact_class: "proof-example-repair",
        changed_files: ["platform/packages/route-governor/src/proof-examples.ts"],
        executable_artifacts: ["runRouteGovernorProofExamples"],
        routing_artifacts: ["repair must cite a live failure"],
        proof_artifacts: ["dist/proof-examples.js"],
        bound_failure_signature: failure,
      }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_candidate");
  assert.deepEqual(verdict.blockers, ["failure repair candidate is not bound to a live failure signature"]);
});

test("blocks stale bases before guard-density routing", () => {
  const verdict = routeGuardDensity(input({ candidate: candidate({ base_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }) }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_base_head");
});

test("keeps readback summaries out of embodiment progress", () => {
  const verdict = routeGuardDensity(input({ candidate: candidate({ candidate_class: "status_readback" }) }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_progress_readback");
});
