import assert from "node:assert/strict";

import {
  compileEmbodimentProgressionContract,
  type EmbodimentProgressionInput,
} from "./embodiment-progression-contract.js";

const branch = "monday-platform-genesis-01";
const priorHead = "dcc3d553e4ef41cd6eeeb7f54eba7f03388c3e0f";
const liveHead = "next-embodiment-head";
const proofModule = "dist/embodiment-progression-contract-proof.js";

function input(overrides: Partial<EmbodimentProgressionInput> = {}): EmbodimentProgressionInput {
  return {
    branch,
    active_branch: branch,
    prior_head_sha: priorHead,
    live_head_sha: liveHead,
    artifact_class: "embodiment-progression-contract",
    spent_artifact_classes: [
      "status-surface-classifier",
      "status-to-embodiment-handoff",
      "post-embodiment-head-cursor",
    ],
    changed_files: [
      "platform/packages/route-governor/src/embodiment-progression-contract.ts",
      "platform/packages/route-governor/src/embodiment-progression-contract-proof.ts",
    ],
    executable_artifacts: ["compileEmbodimentProgressionContract"],
    routing_artifacts: ["moved-head continuations must introduce a new executable artifact class"],
    proof_modules: [proofModule],
    proof_script_modules: [proofModule, "dist/proof-chain-proof.js"],
    ...overrides,
  };
}

const accepted = compileEmbodimentProgressionContract(input());
assert.equal(accepted.ok, true);
assert.equal(accepted.action, "accept_progression");
assert.match(accepted.next_route, /new PR head/);
assert(accepted.decisive_evidence.includes("embodiment-progression-contract"));

const wrongBranch = compileEmbodimentProgressionContract(input({ branch: "main" }));
assert.equal(wrongBranch.ok, false);
assert.equal(wrongBranch.action, "block_branch_mismatch");

const staleHead = compileEmbodimentProgressionContract(input({ live_head_sha: priorHead }));
assert.equal(staleHead.ok, false);
assert.equal(staleHead.action, "block_stale_head");

const repeatedClass = compileEmbodimentProgressionContract(
  input({ artifact_class: "status-to-embodiment-handoff" }),
);
assert.equal(repeatedClass.ok, false);
assert.equal(repeatedClass.action, "block_repeated_artifact_class");

const missingExecutableChange = compileEmbodimentProgressionContract(
  input({ changed_files: ["platform/docs/full-ready-continuation-checkpoint.md"] }),
);
assert.equal(missingExecutableChange.ok, false);
assert.equal(missingExecutableChange.action, "block_incomplete_progression");
assert.deepEqual(missingExecutableChange.blockers, [
  "embodiment progression does not change executable platform files",
]);

const missingProofScriptWiring = compileEmbodimentProgressionContract(
  input({ proof_script_modules: ["dist/proof-chain-proof.js"] }),
);
assert.equal(missingProofScriptWiring.ok, false);
assert.equal(missingProofScriptWiring.action, "block_incomplete_progression");
assert.deepEqual(missingProofScriptWiring.blockers, [
  "proof module is not wired into the proof script: embodiment-progression-contract-proof",
]);

console.log("embodiment progression contract proof passed");
