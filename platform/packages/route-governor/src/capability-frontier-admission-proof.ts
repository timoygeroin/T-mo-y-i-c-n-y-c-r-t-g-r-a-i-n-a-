import assert from "node:assert/strict";

import {
  admitCapabilityFrontier,
  type CapabilityFrontierAdmissionInput,
} from "./capability-frontier-admission.js";

const branch = "monday-platform-genesis-01";
const head = "d868fb31ad946ca31d7245ddb26982ac6b4b4be5";

function input(overrides: Partial<CapabilityFrontierAdmissionInput> = {}): CapabilityFrontierAdmissionInput {
  return {
    target_branch: branch,
    active_branch: branch,
    current_head_sha: head,
    proposed_capability: "capability-frontier-admission",
    spent_capabilities: [
      "status-surface-classifier",
      "post-embodiment-status-router",
      "status-to-embodiment-handoff",
    ],
    changed_files: [
      "platform/packages/route-governor/src/capability-frontier-admission.ts",
      "platform/packages/route-governor/src/capability-frontier-admission-proof.ts",
    ],
    executable_exports: ["admitCapabilityFrontier"],
    proof_artifacts: ["dist/capability-frontier-admission-proof.js"],
    future_routing_effects: [
      "future embodiment must advance a distinct platform capability instead of repeating the same proof family",
    ],
    rejected_move_classes: ["metadata_reread", "duplicate_ci_summary", "old_repaired_head_blocker"],
    ...overrides,
  };
}

const accepted = admitCapabilityFrontier(input());
assert.equal(accepted.ok, true);
assert.equal(accepted.action, "accept_capability_frontier");
assert.equal(accepted.admitted_capability, "capability-frontier-admission");
assert.match(accepted.next_route, /new head status/);
assert.ok(accepted.decisive_evidence.includes("admitCapabilityFrontier"));
assert.ok(accepted.decisive_evidence.includes("metadata_reread"));

const repeatedCapability = admitCapabilityFrontier(
  input({ spent_capabilities: ["capability-frontier-admission"] }),
);
assert.equal(repeatedCapability.ok, false);
assert.equal(repeatedCapability.action, "block_repeated_capability");
assert.deepEqual(repeatedCapability.blockers, ["capability already spent: capability-frontier-admission"]);

const wrongBranch = admitCapabilityFrontier(input({ target_branch: "main" }));
assert.equal(wrongBranch.ok, false);
assert.equal(wrongBranch.action, "block_branch_mismatch");

const docsOnly = admitCapabilityFrontier(input({ changed_files: ["platform/docs/manifestation-contract.md"] }));
assert.equal(docsOnly.ok, false);
assert.equal(docsOnly.action, "block_incomplete_capability");
assert.ok(docsOnly.blockers.includes("capability frontier does not change executable platform files"));

const missingProof = admitCapabilityFrontier(input({ proof_artifacts: [] }));
assert.equal(missingProof.ok, false);
assert.equal(missingProof.action, "block_incomplete_capability");
assert.deepEqual(missingProof.blockers, ["capability frontier has no proof artifact"]);

const noRejectedClass = admitCapabilityFrontier(input({ rejected_move_classes: ["external_platform_embodiment"] }));
assert.equal(noRejectedClass.ok, false);
assert.equal(noRejectedClass.action, "block_incomplete_capability");
assert.ok(noRejectedClass.blockers.includes("capability frontier does not explicitly reject any known non-progress class"));

console.log("capability frontier admission proof passed");
