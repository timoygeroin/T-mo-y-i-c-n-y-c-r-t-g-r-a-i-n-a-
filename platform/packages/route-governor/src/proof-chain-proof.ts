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
  "prompt-head-move-router",
  "live-progress-receipt",
  "route-progress-ledger",
  "statusless-embodiment-admission",
  "continuation-authority",
  "live-status-authority",
  "live-blocker-retirement",
  "post-status-embodiment-queue",
  "pr-body-head-drift-boundary",
  "scheduled-finalization-head-rebase",
  "scheduled-finalization-decision-router",
  "current-instruction-head-boundary",
  "capability-escalation-policy",
  "current-surface-intake",
  "finalization-terminal-progress-contract",
  "status-readback-authority-lease",
  "embodiment-sequence-compiler",
  "review-request-command",
  "scheduled-surface-reconciliation",
  "post-repair-embodiment-admission",
  "proof-chain",
];

function sourcePath(moduleName: string): string {
  return `platform/packages/route-governor/src/${moduleName}.ts`;
}

function proofModule(moduleName: string): string {
  return `dist/${moduleName}-proof.js`;
}

function routeGain(moduleName: string): string {
  return `${moduleName} remains registered as an executable proof-chain route surface`;
}

const requiredArtifacts: ProofChainArtifact[] = registeredProofModules.map((moduleName) => ({
  artifact_id: moduleName,
  source_path: sourcePath(moduleName),
  proof_module: proofModule(moduleName),
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

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runProofChainProof(): void {
  const ready = compileProofChain(input());
  expect(ready.ok, `proof chain should be ready: ${ready.blockers.join("; ")}`);
  expect(ready.action === "proof_chain_ready", `expected proof_chain_ready, got ${ready.action}`);
  expect(
    ready.decisive_evidence.some((evidence) => evidence.includes("post-repair-embodiment-admission")),
    "post-repair embodiment admission must be part of decisive proof-chain evidence",
  );

  for (const moduleName of registeredProofModules) {
    const missingFromScript = compileProofChain(
      input({ proof_script_command: readProofCommand().replace(` && node ${proofModule(moduleName)}`, "") }),
    );
    expect(!missingFromScript.ok, `missing ${moduleName} proof module must block readiness`);
    expect(
      missingFromScript.blockers.some((blocker) => blocker.includes(`${moduleName}-proof`)),
      `missing proof blocker should name ${moduleName}-proof`,
    );

    const unregistered = compileProofChain(
      input({ required_artifacts: requiredArtifacts.filter((artifact) => artifact.artifact_id !== moduleName) }),
    );
    expect(!unregistered.ok, `unregistered ${moduleName} proof must block readiness`);
    expect(
      unregistered.blockers.some((blocker) => blocker.includes(`${moduleName}-proof`)),
      `unregistered proof blocker should name ${moduleName}-proof`,
    );
  }

  const wrongBranch = compileProofChain(input({ active_branch: "main" }));
  expect(!wrongBranch.ok, "proof chain must block release on the wrong branch");
  expect(wrongBranch.action === "block_release", `expected block_release, got ${wrongBranch.action}`);

  const spent = compileProofChain(input({ spent_proof_modules: ["proof-chain-proof"] }));
  expect(!spent.ok, "spent proof-chain proof must not count as new proof-chain progress");
  expect(
    spent.blockers.some((blocker) => blocker.includes("already spent")),
    "spent proof module blocker should be explicit",
  );
}

runProofChainProof();
