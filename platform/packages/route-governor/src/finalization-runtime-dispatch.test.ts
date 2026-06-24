import test from "node:test";
import assert from "node:assert/strict";

import { compileFinalizationRuntimeDispatch, type FinalizationRuntimeDispatchInput } from "./finalization-runtime-dispatch.js";
import type { FinalizationDeliveryGateVerdict } from "./finalization-delivery-gate.js";

const branch = "monday-platform-genesis-01";
const head = "runtime-dispatch-head";

function delivery(overrides: Partial<FinalizationDeliveryGateVerdict> = {}): FinalizationDeliveryGateVerdict {
  return {
    ok: true,
    action: "publish_external_embodiment_to_pr",
    branch,
    head_sha: head,
    delivery_target: "github_pr",
    emission_class: "external_embodiment",
    decisive_evidence: ["runtime dispatch delivery"],
    blockers: [],
    next_route: "dispatch runtime output",
    ...overrides,
  };
}

function input(overrides: Partial<FinalizationRuntimeDispatchInput> = {}): FinalizationRuntimeDispatchInput {
  return {
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    active_pr: 2,
    active_branch: branch,
    live_head_sha: head,
    delivery: delivery(),
    available_write_surfaces: ["github_contents_create_file"],
    runtime_class: "finalization-runtime-dispatch",
    spent_runtime_classes: [],
    runtime_artifacts: ["compileFinalizationRuntimeDispatch"],
    executor_artifacts: ["runtime dispatch command plan"],
    proof_artifacts: ["dist/finalization-runtime-dispatch-proof.js"],
    ...overrides,
  };
}

test("admits an external embodiment only with runtime, executor, proof, and write surface", () => {
  const verdict = compileFinalizationRuntimeDispatch(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.effect, "execute_external_embodiment_commit");
  assert.deepEqual(verdict.blockers, []);
});

test("blocks external embodiment dispatch when branch writes are unavailable", () => {
  const verdict = compileFinalizationRuntimeDispatch(input({ available_write_surfaces: ["pr_metadata"] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.effect, "block_runtime_dispatch");
  assert(verdict.blockers.includes("external embodiment dispatch has no branch write surface"));
});

test("blocks repeated runtime classes", () => {
  const verdict = compileFinalizationRuntimeDispatch(
    input({ runtime_class: "finalization-runtime-dispatch", spent_runtime_classes: ["finalization-runtime-dispatch"] }),
  );

  assert.equal(verdict.ok, false);
  assert(verdict.blockers.includes("runtime class already spent: finalization-runtime-dispatch"));
});

test("dispatches live-head status and exact blockers without requiring a write surface", () => {
  const status = compileFinalizationRuntimeDispatch(
    input({
      available_write_surfaces: [],
      delivery: delivery({ action: "publish_live_head_status_to_pr", emission_class: "live_head_status_readback" }),
    }),
  );
  assert.equal(status.ok, true);
  assert.equal(status.effect, "publish_live_head_status_readback");

  const blocker = compileFinalizationRuntimeDispatch(
    input({
      available_write_surfaces: [],
      delivery: delivery({
        action: "publish_exact_blocker_to_pr",
        emission_class: "exact_external_blocker",
        blockers: ["missing current-head failure log"],
      }),
    }),
  );
  assert.equal(blocker.ok, true);
  assert.equal(blocker.effect, "publish_exact_external_blocker");
});
