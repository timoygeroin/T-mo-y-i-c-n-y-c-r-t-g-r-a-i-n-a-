import { compileProofChain, type ProofChainArtifact, type ProofChainInput } from "./proof-chain.js";

const branch = "monday-platform-genesis-01";
const proofCommand =
  "tsc -p tsconfig.json && node dist/proof-examples.js && node dist/head-transition-proof.js && node dist/embodiment-increment-proof.js && node dist/continuation-handoff-proof.js && node dist/merge-readiness-proof.js && node dist/post-commit-status-boundary-proof.js && node dist/embodiment-class-router-proof.js && node dist/prompt-head-reconciliation-proof.js && node dist/current-head-failure-intake-proof.js && node dist/post-readback-cycle-router-proof.js && node dist/proof-chain-proof.js";

const requiredArtifacts: ProofChainArtifact[] = [
  {
    artifact_id: "head-transition-lineage",
    source_path: "platform/packages/route-governor/src/head-transition.ts",
    proof_module: "dist/head-transition-proof.js",
    route_gain: "continuation receipts must bind previous and current PR heads before release",
  },
  {
    artifact_id: "embodiment-increment-planner",
    source_path: "platform/packages/route-governor/src/embodiment-increment.ts",
    proof_module: "dist/embodiment-increment-proof.js",
    route_gain: "embodiment candidates must change executable and routing artifacts before progress is claimed",
  },
  {
    artifact_id: "continuation-handoff",
    source_path: "platform/packages/route-governor/src/continuation-handoff.ts",
    proof_module: "dist/continuation-handoff-proof.js",
    route_gain: "post-embodiment handoff must route moved heads into current-head status readback",
  },
  {
    artifact_id: "merge-readiness",
    source_path: "platform/packages/route-governor/src/merge-readiness.ts",
    proof_module: "dist/merge-readiness-proof.js",
    route_gain: "merge readiness must remain downstream of current-head status and executable evidence",
  },
  {
    artifact_id: "post-commit-status-boundary",
    source_path: "platform/packages/route-governor/src/post-commit-status-boundary.ts",
    proof_module: "dist/post-commit-status-boundary-proof.js",
    route_gain: "post-commit status claims must bind to the moved PR head before another embodiment step",
  },
  {
    artifact_id: "embodiment-class-router",
    source_path: "platform/packages/route-governor/src/embodiment-class-router.ts",
    proof_module: "dist/embodiment-class-router-proof.js",
    route_gain: "future embodiment classes must be routed against spent artifact classes and proof surfaces",
  },
  {
    artifact_id: "prompt-head-reconciliation",
    source_path: "platform/packages/route-governor/src/prompt-head-reconciliation.ts",
    proof_module: "dist/prompt-head-reconciliation-proof.js",
    route_gain: "prompt-carried repaired heads must yield to the live PR head after branch movement",
  },
  {
    artifact_id: "current-head-failure-intake",
    source_path: "platform/packages/route-governor/src/current-head-failure-intake.ts",
    proof_module: "dist/current-head-failure-intake-proof.js",
    route_gain: "failing current-head checks must expose an actionable log or assertion before repair is selected",
  },
  {
    artifact_id: "post-readback-cycle-router",
    source_path: "platform/packages/route-governor/src/post-readback-cycle-router.ts",
    proof_module: "dist/post-readback-cycle-router-proof.js",
    route_gain: "post-readback continuation must choose between moved-head status, actionable repair, exact blocker, or non-repeated embodiment",
  },
  {
    artifact_id: "proof-chain-completeness",
    source_path: "platform/packages/route-governor/src/proof-chain.ts",
    proof_module: "dist/proof-chain-proof.js",
    route_gain: "future proof claims must prove proof-script completeness before status is treated as complete",
  },
];

function input(overrides: Partial<ProofChainInput> = {}): ProofChainInput {
  return {
    branch,
    active_branch: branch,
    proof_script_command: proofCommand,
    required_artifacts: requiredArtifacts,
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
