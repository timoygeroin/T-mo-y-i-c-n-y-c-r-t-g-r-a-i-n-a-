import { compileProofChain, type ProofChainInput } from "./proof-chain.js";

const branch = "monday-platform-genesis-01";
const proofCommand =
  "tsc -p tsconfig.json && node dist/proof-examples.js && node dist/head-transition-proof.js && node dist/embodiment-increment-proof.js && node dist/continuation-handoff-proof.js && node dist/merge-readiness-proof.js && node dist/post-commit-status-boundary-proof.js && node dist/embodiment-class-router-proof.js && node dist/prompt-head-reconciliation-proof.js && node dist/proof-chain-proof.js";

function input(overrides: Partial<ProofChainInput> = {}): ProofChainInput {
  return {
    branch,
    active_branch: branch,
    proof_script_command: proofCommand,
    required_artifacts: [
      {
        artifact_id: "proof-chain-completeness",
        source_path: "platform/packages/route-governor/src/proof-chain.ts",
        proof_module: "dist/proof-chain-proof.js",
        route_gain: "future proof claims must prove proof-script completeness before status is treated as complete",
      },
    ],
    spent_proof_modules: [],
    ...overrides,
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runProofChainProof(): void {
  const ready = compileProofChain(input());
  assert(ready.ok, `proof chain should be ready: ${ready.blockers.join("; ")}`);
  assert(ready.action === "proof_chain_ready", `expected proof_chain_ready, got ${ready.action}`);

  const missing = compileProofChain(
    input({
      proof_script_command: proofCommand.replace(" && node dist/proof-chain-proof.js", ""),
    }),
  );
  assert(!missing.ok, "missing proof-chain proof module must block readiness");
  assert(missing.action === "repair_proof_chain", `expected repair_proof_chain, got ${missing.action}`);

  const spent = compileProofChain(input({ spent_proof_modules: ["proof-chain-proof"] }));
  assert(!spent.ok, "spent proof-chain proof must not count as new progress");
  assert(
    spent.blockers.some((blocker) => blocker.includes("already spent")),
    "spent proof module blocker should be explicit",
  );
}

runProofChainProof();
