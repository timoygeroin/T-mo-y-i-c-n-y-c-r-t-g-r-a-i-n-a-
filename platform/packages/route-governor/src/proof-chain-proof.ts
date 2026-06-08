import { compileProofChain, type ProofChainArtifact, type ProofChainInput } from "./proof-chain.js";

const branch = "monday-platform-genesis-01";
const proofCommand =
  "tsc -p tsconfig.json && node dist/proof-examples.js && node dist/head-transition-proof.js && node dist/embodiment-increment-proof.js && node dist/continuation-handoff-proof.js && node dist/merge-readiness-proof.js && node dist/post-commit-status-boundary-proof.js && node dist/embodiment-class-router-proof.js && node dist/prompt-head-reconciliation-proof.js && node dist/current-head-failure-intake-proof.js && node dist/post-readback-cycle-router-proof.js && node dist/progress-boundary-proof.js && node dist/head-source-arbitration-proof.js && node dist/proof-chain-extension-proof.js && node dist/external-embodiment-receipt-proof.js && node dist/post-readback-continuation-router-proof.js && node dist/post-readback-embodiment-planner-proof.js && node dist/scheduled-finalization-router-proof.js && node dist/readback-access-boundary-proof.js && node dist/public-route-exports-proof.js && node dist/loading20-continuation-gate-proof.js && node dist/live-head-advance-policy-proof.js && node dist/external-write-surface-proof.js && node dist/proof-failure-repair-plan-proof.js && node dist/proof-chain-proof.js";

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
    artifact_id: "progress-boundary",
    source_path: "platform/packages/route-governor/src/progress-boundary.ts",
    proof_module: "dist/progress-boundary-proof.js",
    route_gain: "non-progress classes are rejected before release while embodiment, fresh readback, and exact blockers remain admissible",
  },
  {
    artifact_id: "head-source-arbitration",
    source_path: "platform/packages/route-governor/src/head-source-arbitration.ts",
    proof_module: "dist/head-source-arbitration-proof.js",
    route_gain: "prompt-carried heads and PR-body readbacks must yield to live PR metadata before status or blocker selection",
  },
  {
    artifact_id: "proof-chain-extension-gate",
    source_path: "platform/packages/route-governor/src/proof-chain-extension.ts",
    proof_module: "dist/proof-chain-extension-proof.js",
    route_gain: "future proof-chain extensions must be wired into source, proof script, and registry before progress is claimed",
  },
  {
    artifact_id: "external-embodiment-receipt",
    source_path: "platform/packages/route-governor/src/external-embodiment-receipt.ts",
    proof_module: "dist/external-embodiment-receipt-proof.js",
    route_gain: "external embodiment progress must prove the PR head moved and reject old-head or pending status surfaces",
  },
  {
    artifact_id: "post-readback-continuation-router",
    source_path: "platform/packages/route-governor/src/post-readback-continuation-router.ts",
    proof_module: "dist/post-readback-continuation-router-proof.js",
    route_gain: "after a successful current-head readback, continuation must reject non-progress classes and select embodiment or exact live blocker",
  },
  {
    artifact_id: "post-readback-embodiment-planner",
    source_path: "platform/packages/route-governor/src/post-readback-embodiment-planner.ts",
    proof_module: "dist/post-readback-embodiment-planner-proof.js",
    route_gain: "post-readback embodiment candidates must include executable platform changes, routing artifacts, and proof commands",
  },
  {
    artifact_id: "scheduled-finalization-router",
    source_path: "platform/packages/route-governor/src/scheduled-finalization-router.ts",
    proof_module: "dist/scheduled-finalization-router-proof.js",
    route_gain: "scheduled runs with stale prompt heads must reject old blockers and choose live-head status, exact live blocker, or executable embodiment",
  },
  {
    artifact_id: "readback-access-boundary",
    source_path: "platform/packages/route-governor/src/readback-access-boundary.ts",
    proof_module: "dist/readback-access-boundary-proof.js",
    route_gain: "status claims must be backed by Checks, Actions, or workflow-published readback evidence instead of PR metadata or commit diffs",
  },
  {
    artifact_id: "public-route-exports",
    source_path: "platform/packages/route-governor/src/public-route-exports.ts",
    proof_module: "dist/public-route-exports-proof.js",
    route_gain: "public route surfaces must be wired through package exports, index exports, and proof before progress is claimed",
  },
  {
    artifact_id: "loading20-continuation-gate",
    source_path: "platform/packages/route-governor/src/loading20-continuation-gate.ts",
    proof_module: "dist/loading20-continuation-gate-proof.js",
    route_gain: "Loading 20 continuations must reject repaired-head blockers and route moved heads through status, executable embodiment, or exact live blocker",
  },
  {
    artifact_id: "live-head-advance-policy",
    source_path: "platform/packages/route-governor/src/live-head-advance-policy.ts",
    proof_module: "dist/live-head-advance-policy-proof.js",
    route_gain: "live-head advancement must prefer current-head status or actionable repair while preserving Node.js 20 notices as warnings",
  },
  {
    artifact_id: "external-write-surface",
    source_path: "platform/packages/route-governor/src/external-write-surface.ts",
    proof_module: "dist/external-write-surface-proof.js",
    route_gain: "when local checkout or gh CLI are absent, available GitHub contents writes must route to executable embodiment instead of false no-surface blockers",
  },
  {
    artifact_id: "proof-failure-repair-plan",
    source_path: "platform/packages/route-governor/src/proof-failure-repair-plan.ts",
    proof_module: "dist/proof-failure-repair-plan-proof.js",
    route_gain: "proof-example repairs must bind to a live-head actionable failure line before code edits can count as progress",
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

  const unregistered = compileProofChain(
    input({
      required_artifacts: requiredArtifacts.filter((artifact) => artifact.artifact_id !== "readback-access-boundary"),
    }),
  );
  assert(!unregistered.ok, "unregistered readback access proof must block proof-chain readiness");
  assert(
    unregistered.blockers.some((blocker) => blocker.includes("readback-access-boundary-proof")),
    "unregistered proof blocker should name readback-access-boundary-proof",
  );

  const unregisteredPublicExport = compileProofChain(
    input({
      required_artifacts: requiredArtifacts.filter((artifact) => artifact.artifact_id !== "public-route-exports"),
    }),
  );
  assert(!unregisteredPublicExport.ok, "unregistered public route export proof must block proof-chain readiness");
  assert(
    unregisteredPublicExport.blockers.some((blocker) => blocker.includes("public-route-exports-proof")),
    "unregistered public route export blocker should name public-route-exports-proof",
  );

  const unregisteredLoading20Gate = compileProofChain(
    input({
      required_artifacts: requiredArtifacts.filter((artifact) => artifact.artifact_id !== "loading20-continuation-gate"),
    }),
  );
  assert(!unregisteredLoading20Gate.ok, "unregistered Loading 20 proof must block proof-chain readiness");
  assert(
    unregisteredLoading20Gate.blockers.some((blocker) => blocker.includes("loading20-continuation-gate-proof")),
    "unregistered Loading 20 blocker should name loading20-continuation-gate-proof",
  );

  const unregisteredLiveHeadPolicy = compileProofChain(
    input({
      required_artifacts: requiredArtifacts.filter((artifact) => artifact.artifact_id !== "live-head-advance-policy"),
    }),
  );
  assert(!unregisteredLiveHeadPolicy.ok, "unregistered live-head advance proof must block proof-chain readiness");
  assert(
    unregisteredLiveHeadPolicy.blockers.some((blocker) => blocker.includes("live-head-advance-policy-proof")),
    "unregistered live-head blocker should name live-head-advance-policy-proof",
  );

  const unregisteredExternalWriteSurface = compileProofChain(
    input({
      required_artifacts: requiredArtifacts.filter((artifact) => artifact.artifact_id !== "external-write-surface"),
    }),
  );
  assert(!unregisteredExternalWriteSurface.ok, "unregistered external write surface proof must block proof-chain readiness");
  assert(
    unregisteredExternalWriteSurface.blockers.some((blocker) => blocker.includes("external-write-surface-proof")),
    "unregistered external write surface blocker should name external-write-surface-proof",
  );

  const unregisteredProofFailureRepair = compileProofChain(
    input({
      required_artifacts: requiredArtifacts.filter((artifact) => artifact.artifact_id !== "proof-failure-repair-plan"),
    }),
  );
  assert(!unregisteredProofFailureRepair.ok, "unregistered proof-failure repair proof must block proof-chain readiness");
  assert(
    unregisteredProofFailureRepair.blockers.some((blocker) => blocker.includes("proof-failure-repair-plan-proof")),
    "unregistered proof-failure repair blocker should name proof-failure-repair-plan-proof",
  );

  const spent = compileProofChain(input({ spent_proof_modules: ["proof-chain-proof"] }));
  assert(!spent.ok, "spent proof-chain proof must not count as new progress");
  assert(
    spent.blockers.some((blocker) => blocker.includes("already spent")),
    "spent proof module blocker should be explicit",
  );
}

runProofChainProof();
