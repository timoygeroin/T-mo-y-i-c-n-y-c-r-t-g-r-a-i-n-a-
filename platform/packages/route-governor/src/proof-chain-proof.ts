import { readFileSync } from "node:fs";

import { compileProofChain, type ProofChainArtifact, type ProofChainInput } from "./proof-chain.js";

const branch = "monday-platform-genesis-01";

interface PackageJson {
  scripts?: Record<string, string>;
}

function readProofCommand(): string {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as PackageJson;
  const command = packageJson.scripts?.["proof:examples"];

  if (!command) {
    throw new Error("package.json has no proof:examples script");
  }

  return command;
}

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
    artifact_id: "finalization-progress-contract",
    source_path: "platform/packages/route-governor/src/finalization-progress-contract.ts",
    proof_module: "dist/finalization-progress-contract-proof.js",
    route_gain: "Loading 20 finalization progress must reject repaired-head blocker replay and distinguish live-head readback from executable embodiment",
  },
  {
    artifact_id: "finalization-runner",
    source_path: "platform/packages/route-governor/src/finalization-runner.ts",
    proof_module: "dist/finalization-runner-proof.js",
    route_gain: "scheduled finalization must collapse to one executable act, live-head readback, or exact blocker without leaking commentary",
  },
  {
    artifact_id: "finalization-delivery-gate",
    source_path: "platform/packages/route-governor/src/finalization-delivery-gate.ts",
    proof_module: "dist/finalization-delivery-gate-proof.js",
    route_gain: "delivery claims must be backed by changed executable behavior, status evidence, or an exact external blocker",
  },
  {
    artifact_id: "finalization-live-head-handoff",
    source_path: "platform/packages/route-governor/src/finalization-live-head-handoff.ts",
    proof_module: "dist/finalization-live-head-handoff-proof.js",
    route_gain: "finalization handoff must bind any prompt-carried head to the live PR head before release routing",
  },
  {
    artifact_id: "post-embodiment-head-cursor",
    source_path: "platform/packages/route-governor/src/post-embodiment-head-cursor.ts",
    proof_module: "dist/post-embodiment-head-cursor-proof.js",
    route_gain: "after each embodiment commit, the next cursor must target the new PR head instead of the previous repaired head",
  },
  {
    artifact_id: "post-embodiment-status-router",
    source_path: "platform/packages/route-governor/src/post-embodiment-status-router.ts",
    proof_module: "dist/post-embodiment-status-router-proof.js",
    route_gain: "post-embodiment routing must choose current-head status readback, actionable repair, or exact blocker before release claims",
  },
  {
    artifact_id: "status-to-embodiment-handoff",
    source_path: "platform/packages/route-governor/src/status-to-embodiment-handoff.ts",
    proof_module: "dist/status-to-embodiment-handoff-proof.js",
    route_gain: "passing current-head status must hand off to a new embodiment class instead of duplicate CI summaries",
  },
  {
    artifact_id: "embodiment-progression-contract",
    source_path: "platform/packages/route-governor/src/embodiment-progression-contract.ts",
    proof_module: "dist/embodiment-progression-contract-proof.js",
    route_gain: "embodiment progression must advance artifact class and proof evidence before counting as platform movement",
  },
  {
    artifact_id: "live-head-readback-cursor",
    source_path: "platform/packages/route-governor/src/live-head-readback-cursor.ts",
    proof_module: "dist/live-head-readback-cursor-proof.js",
    route_gain: "fresh readback cursors must bind to the live PR head and reject old repaired-head status reuse",
  },
  {
    artifact_id: "status-readback-transport",
    source_path: "platform/packages/route-governor/src/status-readback-transport.ts",
    proof_module: "dist/status-readback-transport-proof.js",
    route_gain: "status readback transport must reject PR metadata and commit diffs as non-status surfaces before status claims",
  },
  {
    artifact_id: "proof-chain-completeness",
    source_path: "platform/packages/route-governor/src/proof-chain.ts",
    proof_module: "dist/proof-chain-proof.js",
    route_gain: "future proof claims must prove the package proof script and proof registry are synchronized before status is treated as complete",
  },
];

function input(overrides: Partial<ProofChainInput> = {}): ProofChainInput {
  return {
    branch,
    active_branch: branch,
    proof_script_command: readProofCommand(),
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
      proof_script_command: readProofCommand().replace(" && node dist/proof-chain-proof.js", ""),
    }),
  );
  assert(!missing.ok, "missing proof-chain proof module must block readiness");
  assert(missing.action === "repair_proof_chain", `expected repair_proof_chain, got ${missing.action}`);

  const unregisteredTransport = compileProofChain(
    input({
      required_artifacts: requiredArtifacts.filter((artifact) => artifact.artifact_id !== "status-readback-transport"),
    }),
  );
  assert(!unregisteredTransport.ok, "unregistered status-readback transport proof must block proof-chain readiness");
  assert(
    unregisteredTransport.blockers.some((blocker) => blocker.includes("status-readback-transport-proof")),
    "unregistered transport blocker should name status-readback-transport-proof",
  );

  const spent = compileProofChain(input({ spent_proof_modules: ["proof-chain-proof"] }));
  assert(!spent.ok, "spent proof-chain proof must not count as new progress");
  assert(
    spent.blockers.some((blocker) => blocker.includes("already spent")),
    "spent proof module blocker should be explicit",
  );
}

runProofChainProof();
