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

const registeredProofModules = [
  "head-transition",
  "embodiment-increment",
  "embodiment-impact-classifier",
  "continuation-handoff",
  "merge-readiness",
  "post-commit-status-boundary",
  "embodiment-class-router",
  "prompt-head-reconciliation",
  "current-head-failure-intake",
  "post-readback-cycle-router",
  "progress-boundary",
  "head-source-arbitration",
  "proof-chain-extension",
  "external-embodiment-receipt",
  "post-readback-continuation-router",
  "post-readback-embodiment-planner",
  "scheduled-finalization-router",
  "readback-access-boundary",
  "public-route-exports",
  "public-route-completeness",
  "loading20-continuation-gate",
  "live-head-advance-policy",
  "external-write-surface",
  "proof-failure-repair-plan",
  "finalization-progress-contract",
  "finalization-runner",
  "finalization-delivery-gate",
  "finalization-live-head-handoff",
  "post-embodiment-head-cursor",
  "post-embodiment-status-router",
  "status-to-embodiment-handoff",
  "embodiment-progression-contract",
  "finalization-next-step-admission",
  "live-head-readback-cursor",
  "status-readback-transport",
  "manifestation-source-arbitration",
  "capability-frontier-admission",
  "embodiment-completion-receipt",
  "source-ranked-finalization-admission",
  "current-head-repair-admission",
  "embodiment-runtime-budget",
  "finalization-runtime-dispatch",
  "scheduled-live-head-admission",
  "runtime-execution-queue",
  "failure-detail-escalation",
  "github-contents-executor",
  "next-embodiment-selector",
  "github-contents-result-receipt",
  "github-contents-mutation-batch",
  "route-state-transition",
  "warning-maintenance-router",
  "statusless-embodiment-admission",
  "continuation-authority",
  "live-status-authority",
  "live-blocker-retirement",
  "proof-chain",
];

function sourcePath(moduleName: string): string {
  return `platform/packages/route-governor/src/${moduleName}.ts`;
}

function routeGain(moduleName: string): string {
  return `${moduleName} remains registered as an executable proof-chain route surface`;
}

const requiredArtifacts: ProofChainArtifact[] = registeredProofModules.map((moduleName) => ({
  artifact_id: moduleName,
  source_path: sourcePath(moduleName),
  proof_module: `dist/${moduleName}-proof.js`,
  route_gain: routeGain(moduleName),
}));

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

  const missingLiveStatusAuthority = compileProofChain(
    input({
      proof_script_command: readProofCommand().replace(" && node dist/live-status-authority-proof.js", ""),
    }),
  );
  assert(!missingLiveStatusAuthority.ok, "missing live-status-authority proof module must block readiness");
  assert(
    missingLiveStatusAuthority.blockers.some((blocker) => blocker.includes("live-status-authority-proof")),
    "missing live status authority blocker should name live-status-authority-proof",
  );

  const missingLiveBlockerRetirement = compileProofChain(
    input({
      proof_script_command: readProofCommand().replace(" && node dist/live-blocker-retirement-proof.js", ""),
    }),
  );
  assert(!missingLiveBlockerRetirement.ok, "missing live-blocker-retirement proof module must block readiness");
  assert(
    missingLiveBlockerRetirement.blockers.some((blocker) => blocker.includes("live-blocker-retirement-proof")),
    "missing live blocker retirement blocker should name live-blocker-retirement-proof",
  );

  const missingMutationBatch = compileProofChain(
    input({
      proof_script_command: readProofCommand().replace(" && node dist/github-contents-mutation-batch-proof.js", ""),
    }),
  );
  assert(!missingMutationBatch.ok, "missing mutation-batch proof module must block readiness");
  assert(
    missingMutationBatch.blockers.some((blocker) => blocker.includes("github-contents-mutation-batch-proof")),
    "missing mutation batch blocker should name github-contents-mutation-batch-proof",
  );

  const unregisteredExecutor = compileProofChain(
    input({
      required_artifacts: requiredArtifacts.filter((artifact) => artifact.artifact_id !== "github-contents-executor"),
    }),
  );
  assert(!unregisteredExecutor.ok, "unregistered github contents executor proof must block readiness");
  assert(
    unregisteredExecutor.blockers.some((blocker) => blocker.includes("github-contents-executor-proof")),
    "unregistered executor blocker should name github-contents-executor-proof",
  );

  const spent = compileProofChain(input({ spent_proof_modules: ["proof-chain-proof"] }));
  assert(!spent.ok, "spent proof-chain proof must not count as new progress");
  assert(
    spent.blockers.some((blocker) => blocker.includes("already spent")),
    "spent proof module blocker should be explicit",
  );
}

runProofChainProof();
