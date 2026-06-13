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

  const missingLiveProgressReceipt = compileProofChain(
    input({
      proof_script_command: readProofCommand().replace(" && node dist/live-progress-receipt-proof.js", ""),
    }),
  );
  assert(!missingLiveProgressReceipt.ok, "missing live-progress-receipt proof module must block readiness");
  assert(
    missingLiveProgressReceipt.blockers.some((blocker) => blocker.includes("live-progress-receipt-proof")),
    "missing live progress receipt blocker should name live-progress-receipt-proof",
  );

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

  const missingCurrentInstructionHeadBoundary = compileProofChain(
    input({
      proof_script_command: readProofCommand().replace(" && node dist/current-instruction-head-boundary-proof.js", ""),
    }),
  );
  assert(!missingCurrentInstructionHeadBoundary.ok, "missing current-instruction-head-boundary proof module must block readiness");
  assert(
    missingCurrentInstructionHeadBoundary.blockers.some((blocker) =>
      blocker.includes("current-instruction-head-boundary-proof"),
    ),
    "missing current instruction head boundary blocker should name current-instruction-head-boundary-proof",
  );

  const missingCurrentSurfaceIntake = compileProofChain(
    input({
      proof_script_command: readProofCommand().replace(" && node dist/current-surface-intake-proof.js", ""),
    }),
  );
  assert(!missingCurrentSurfaceIntake.ok, "missing current-surface-intake proof module must block readiness");
  assert(
    missingCurrentSurfaceIntake.blockers.some((blocker) => blocker.includes("current-surface-intake-proof")),
    "missing current surface intake blocker should name current-surface-intake-proof",
  );

  const missingTerminalProgressContract = compileProofChain(
    input({
      proof_script_command: readProofCommand().replace(
        " && node dist/finalization-terminal-progress-contract-proof.js",
        "",
      ),
    }),
  );
  assert(!missingTerminalProgressContract.ok, "missing terminal-progress contract proof module must block readiness");
  assert(
    missingTerminalProgressContract.blockers.some((blocker) =>
      blocker.includes("finalization-terminal-progress-contract-proof"),
    ),
    "missing terminal progress contract blocker should name finalization-terminal-progress-contract-proof",
  );

  const missingStatusReadbackAuthorityLease = compileProofChain(
    input({
      proof_script_command: readProofCommand().replace(" && node dist/status-readback-authority-lease-proof.js", ""),
    }),
  );
  assert(!missingStatusReadbackAuthorityLease.ok, "missing status-readback-authority-lease proof module must block readiness");
  assert(
    missingStatusReadbackAuthorityLease.blockers.some((blocker) =>
      blocker.includes("status-readback-authority-lease-proof"),
    ),
    "missing status readback authority lease blocker should name status-readback-authority-lease-proof",
  );

  const missingEmbodimentSequenceCompiler = compileProofChain(
    input({
      proof_script_command: readProofCommand().replace(" && node dist/embodiment-sequence-compiler-proof.js", ""),
    }),
  );
  assert(!missingEmbodimentSequenceCompiler.ok, "missing embodiment-sequence-compiler proof module must block readiness");
  assert(
    missingEmbodimentSequenceCompiler.blockers.some((blocker) =>
      blocker.includes("embodiment-sequence-compiler-proof"),
    ),
    "missing embodiment sequence compiler blocker should name embodiment-sequence-compiler-proof",
  );

  const missingReviewRequestCommand = compileProofChain(
    input({
      proof_script_command: readProofCommand().replace(" && node dist/review-request-command-proof.js", ""),
    }),
  );
  assert(!missingReviewRequestCommand.ok, "missing review-request-command proof module must block readiness");
  assert(
    missingReviewRequestCommand.blockers.some((blocker) => blocker.includes("review-request-command-proof")),
    "missing review request command blocker should name review-request-command-proof",
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

  const unregisteredLiveProgressReceipt = compileProofChain(
    input({
      required_artifacts: requiredArtifacts.filter((artifact) => artifact.artifact_id !== "live-progress-receipt"),
    }),
  );
  assert(!unregisteredLiveProgressReceipt.ok, "unregistered live progress receipt proof must block readiness");
  assert(
    unregisteredLiveProgressReceipt.blockers.some((blocker) => blocker.includes("live-progress-receipt-proof")),
    "unregistered live progress receipt blocker should name live-progress-receipt-proof",
  );

  const unregisteredCurrentInstructionHeadBoundary = compileProofChain(
    input({
      required_artifacts: requiredArtifacts.filter(
        (artifact) => artifact.artifact_id !== "current-instruction-head-boundary",
      ),
    }),
  );
  assert(!unregisteredCurrentInstructionHeadBoundary.ok, "unregistered current instruction proof must block readiness");
  assert(
    unregisteredCurrentInstructionHeadBoundary.blockers.some((blocker) =>
      blocker.includes("current-instruction-head-boundary-proof"),
    ),
    "unregistered current instruction blocker should name current-instruction-head-boundary-proof",
  );

  const unregisteredCapabilityEscalationPolicy = compileProofChain(
    input({
      required_artifacts: requiredArtifacts.filter((artifact) => artifact.artifact_id !== "capability-escalation-policy"),
    }),
  );
  assert(!unregisteredCapabilityEscalationPolicy.ok, "unregistered capability escalation policy proof must block readiness");
  assert(
    unregisteredCapabilityEscalationPolicy.blockers.some((blocker) => blocker.includes("capability-escalation-policy-proof")),
    "unregistered capability escalation policy blocker should name capability-escalation-policy-proof",
  );

  const unregisteredCurrentSurfaceIntake = compileProofChain(
    input({
      required_artifacts: requiredArtifacts.filter((artifact) => artifact.artifact_id !== "current-surface-intake"),
    }),
  );
  assert(!unregisteredCurrentSurfaceIntake.ok, "unregistered current surface intake proof must block readiness");
  assert(
    unregisteredCurrentSurfaceIntake.blockers.some((blocker) => blocker.includes("current-surface-intake-proof")),
    "unregistered current surface intake blocker should name current-surface-intake-proof",
  );

  const unregisteredTerminalProgressContract = compileProofChain(
    input({
      required_artifacts: requiredArtifacts.filter(
        (artifact) => artifact.artifact_id !== "finalization-terminal-progress-contract",
      ),
    }),
  );
  assert(!unregisteredTerminalProgressContract.ok, "unregistered terminal progress proof must block readiness");
  assert(
    unregisteredTerminalProgressContract.blockers.some((blocker) =>
      blocker.includes("finalization-terminal-progress-contract-proof"),
    ),
    "unregistered terminal progress blocker should name finalization-terminal-progress-contract-proof",
  );

  const unregisteredStatusReadbackAuthorityLease = compileProofChain(
    input({
      required_artifacts: requiredArtifacts.filter(
        (artifact) => artifact.artifact_id !== "status-readback-authority-lease",
      ),
    }),
  );
  assert(!unregisteredStatusReadbackAuthorityLease.ok, "unregistered status readback authority lease proof must block readiness");
  assert(
    unregisteredStatusReadbackAuthorityLease.blockers.some((blocker) =>
      blocker.includes("status-readback-authority-lease-proof"),
    ),
    "unregistered status readback authority lease blocker should name status-readback-authority-lease-proof",
  );

  const unregisteredEmbodimentSequenceCompiler = compileProofChain(
    input({
      required_artifacts: requiredArtifacts.filter((artifact) => artifact.artifact_id !== "embodiment-sequence-compiler"),
    }),
  );
  assert(!unregisteredEmbodimentSequenceCompiler.ok, "unregistered embodiment sequence compiler proof must block readiness");
  assert(
    unregisteredEmbodimentSequenceCompiler.blockers.some((blocker) =>
      blocker.includes("embodiment-sequence-compiler-proof"),
    ),
    "unregistered embodiment sequence compiler blocker should name embodiment-sequence-compiler-proof",
  );

  const unregisteredReviewRequestCommand = compileProofChain(
    input({
      required_artifacts: requiredArtifacts.filter((artifact) => artifact.artifact_id !== "review-request-command"),
    }),
  );
  assert(!unregisteredReviewRequestCommand.ok, "unregistered review request command proof must block readiness");
  assert(
    unregisteredReviewRequestCommand.blockers.some((blocker) => blocker.includes("review-request-command-proof")),
    "unregistered review request command blocker should name review-request-command-proof",
  );

  const spent = compileProofChain(input({ spent_proof_modules: ["proof-chain-proof"] }));
  assert(!spent.ok, "spent proof-chain proof must not count as new progress");
  assert(
    spent.blockers.some((blocker) => blocker.includes("already spent")),
    "spent proof module blocker should be explicit",
  );
}

runProofChainProof();
