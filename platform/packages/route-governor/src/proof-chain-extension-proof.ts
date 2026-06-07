import {
  compileProofChainExtension,
  type ProofChainExtensionArtifact,
  type ProofChainExtensionInput,
} from "./proof-chain-extension.js";

const branch = "monday-platform-genesis-01";
const candidate: ProofChainExtensionArtifact = {
  artifact_id: "proof-chain-extension-gate",
  source_path: "platform/packages/route-governor/src/proof-chain-extension.ts",
  proof_module: "dist/proof-chain-extension-proof.js",
  route_gain: "future proof-chain extensions must be wired into source, proof script, and registry before progress is claimed",
};

const proofCommand =
  "tsc -p tsconfig.json && node dist/proof-chain-extension-proof.js && node dist/proof-chain-proof.js";

function input(overrides: Partial<ProofChainExtensionInput> = {}): ProofChainExtensionInput {
  return {
    branch,
    active_branch: branch,
    candidate,
    changed_files: [
      "platform/packages/route-governor/src/proof-chain-extension.ts",
      "platform/packages/route-governor/src/proof-chain-extension-proof.ts",
      "platform/packages/route-governor/package.json",
      "platform/packages/route-governor/src/proof-chain-proof.ts",
    ],
    proof_script_command: proofCommand,
    proof_registry_artifacts: [candidate],
    spent_artifact_classes: [],
    artifact_class: "proof_chain_extension_gate",
    ...overrides,
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runProofChainExtensionProof(): void {
  const ready = compileProofChainExtension(input());
  assert(ready.ok, `proof-chain extension should be accepted: ${ready.blockers.join("; ")}`);
  assert(ready.action === "accept_extension", `expected accept_extension, got ${ready.action}`);

  const missingProofScript = compileProofChainExtension(
    input({ proof_script_command: "tsc -p tsconfig.json && node dist/proof-chain-proof.js" }),
  );
  assert(!missingProofScript.ok, "extension must fail when proof script does not execute its proof module");
  assert(
    missingProofScript.blockers.some((blocker) => blocker.includes("not executed by proof script")),
    "missing proof-script blocker should be explicit",
  );

  const missingRegistry = compileProofChainExtension(input({ proof_registry_artifacts: [] }));
  assert(!missingRegistry.ok, "extension must fail when proof-chain registry omits the candidate");
  assert(
    missingRegistry.blockers.some((blocker) => blocker.includes("not registered")),
    "missing registry blocker should be explicit",
  );

  const spent = compileProofChainExtension(input({ spent_artifact_classes: ["proof_chain_extension_gate"] }));
  assert(!spent.ok, "spent extension class must not count as new progress");
  assert(spent.blockers.some((blocker) => blocker.includes("already spent")), "spent-class blocker should be explicit");
}

runProofChainExtensionProof();
