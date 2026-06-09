import assert from "node:assert/strict";

import {
  compileFinalizationRuntimeDispatch,
  type FinalizationRuntimeDispatchInput,
} from "./finalization-runtime-dispatch.js";
import type { FinalizationDeliveryGateVerdict } from "./finalization-delivery-gate.js";

const repository = "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-";
const branch = "monday-platform-genesis-01";
const head = "124364ea79bf0708e9c3a3e9e27063b3aea1bcf2";

function delivery(overrides: Partial<FinalizationDeliveryGateVerdict> = {}): FinalizationDeliveryGateVerdict {
  return {
    ok: true,
    action: "publish_external_embodiment_to_pr",
    branch,
    head_sha: head,
    delivery_target: "github_pr",
    emission_class: "external_embodiment",
    decisive_evidence: ["PR #2", branch, "compileFinalizationRuntimeDispatch"],
    blockers: [],
    next_route: "dispatch runtime embodiment to the active PR branch",
    ...overrides,
  };
}

function input(overrides: Partial<FinalizationRuntimeDispatchInput> = {}): FinalizationRuntimeDispatchInput {
  return {
    repository_full_name: repository,
    active_pr: 2,
    active_branch: branch,
    live_head_sha: head,
    delivery: delivery(),
    available_write_surfaces: ["github_contents_update_file", "pr_metadata"],
    runtime_class: "finalization-runtime-dispatch",
    spent_runtime_classes: ["finalization-runner", "finalization-delivery-gate"],
    runtime_artifacts: ["compileFinalizationRuntimeDispatch"],
    executor_artifacts: ["runtime command plan for PR-bound finalization delivery"],
    proof_artifacts: ["dist/finalization-runtime-dispatch-proof.js"],
    ...overrides,
  };
}

const accepted = compileFinalizationRuntimeDispatch(input());
assert.equal(accepted.ok, true);
assert.equal(accepted.effect, "execute_external_embodiment_commit");
assert(accepted.command_plan.some((command) => command.includes("github_contents_update_file")));
assert(accepted.decisive_evidence.includes("compileFinalizationRuntimeDispatch"));

const noWriteSurface = compileFinalizationRuntimeDispatch(
  input({ available_write_surfaces: ["pr_metadata", "commit_diff"] }),
);
assert.equal(noWriteSurface.ok, false);
assert.equal(noWriteSurface.effect, "block_runtime_dispatch");
assert(noWriteSurface.blockers.includes("external embodiment dispatch has no branch write surface"));

const spentRuntime = compileFinalizationRuntimeDispatch(
  input({ runtime_class: "finalization-runner", spent_runtime_classes: ["finalization-runner"] }),
);
assert.equal(spentRuntime.ok, false);
assert(spentRuntime.blockers.includes("runtime class already spent: finalization-runner"));

const statusReadback = compileFinalizationRuntimeDispatch(
  input({
    available_write_surfaces: [],
    delivery: delivery({
      action: "publish_live_head_status_to_pr",
      emission_class: "live_head_status_readback",
      decisive_evidence: ["current-head check run 27049651469 succeeded"],
    }),
  }),
);
assert.equal(statusReadback.ok, true);
assert.equal(statusReadback.effect, "publish_live_head_status_readback");
assert(statusReadback.command_plan.some((command) => command.includes(head)));

const exactBlocker = compileFinalizationRuntimeDispatch(
  input({
    available_write_surfaces: [],
    delivery: delivery({
      action: "publish_exact_blocker_to_pr",
      emission_class: "exact_external_blocker",
      decisive_evidence: ["missing current-head failure log"],
      blockers: ["missing current-head failure log"],
    }),
  }),
);
assert.equal(exactBlocker.ok, true);
assert.equal(exactBlocker.effect, "publish_exact_external_blocker");

const wrongHead = compileFinalizationRuntimeDispatch(input({ delivery: delivery({ head_sha: "stale-head" }) }));
assert.equal(wrongHead.ok, false);
assert(wrongHead.blockers.includes(`delivery head stale-head does not match live head ${head}`));

console.log("finalization runtime dispatch proof passed");
