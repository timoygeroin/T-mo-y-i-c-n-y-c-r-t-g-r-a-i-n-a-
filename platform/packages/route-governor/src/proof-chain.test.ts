import test from "node:test";
import assert from "node:assert/strict";

import { compileProofChain, type ProofChainInput } from "./proof-chain.js";

const branch = "monday-platform-genesis-01";
const command = "tsc -p tsconfig.json && node dist/proof-examples.js && node dist/proof-chain-proof.js";

function input(overrides: Partial<ProofChainInput> = {}): ProofChainInput {
  return {
    branch,
    active_branch: branch,
    proof_script_command: command,
    required_artifacts: [
      {
        artifact_id: "proof-chain-completeness",
        source_path: "platform/packages/route-governor/src/proof-chain.ts",
        proof_module: "dist/proof-chain-proof.js",
        route_gain: "future proof claims must compile their proof-script wiring before status is treated as complete",
      },
    ],
    spent_proof_modules: [],
    ...overrides,
  };
}

test("accepts a required proof artifact only when the proof script executes it", () => {
  const verdict = compileProofChain(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "proof_chain_ready");
  assert.deepEqual(verdict.blockers, []);
  assert.ok(verdict.proof_modules.includes("proof-chain-proof"));
});

test("blocks proof readiness when a required proof module is missing from the proof command", () => {
  const verdict = compileProofChain(
    input({
      proof_script_command: "tsc -p tsconfig.json && node dist/proof-examples.js",
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "repair_proof_chain");
  assert.ok(verdict.blockers.some((blocker) => blocker.includes("required proof module is not executed")));
});

test("blocks unregistered proof modules in the proof command", () => {
  const verdict = compileProofChain(
    input({
      proof_script_command: `${command} && node dist/unregistered-proof.js`,
    }),
  );

  assert.equal(verdict.ok, false);
  assert.ok(verdict.blockers.includes("proof script executes an unregistered proof module: unregistered-proof"));
});

test("blocks spent proof modules from counting as new proof-chain progress", () => {
  const verdict = compileProofChain(
    input({
      spent_proof_modules: ["dist/proof-chain-proof.js"],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.ok(verdict.blockers.includes("proof module is already spent and cannot be counted as new proof-chain progress: proof-chain-proof"));
});

test("blocks branch mismatch before proof-chain release", () => {
  const verdict = compileProofChain(input({ active_branch: "main" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_release");
  assert.ok(verdict.blockers[0].includes("does not match active branch"));
});
