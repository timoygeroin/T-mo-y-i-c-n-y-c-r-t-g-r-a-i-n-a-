export type ProofChainAction = "proof_chain_ready" | "repair_proof_chain" | "block_release";

export interface ProofChainArtifact {
  artifact_id: string;
  source_path: string;
  proof_module: string;
  route_gain: string;
}

export interface ProofChainInput {
  branch: string;
  active_branch: string;
  proof_script_command: string;
  required_artifacts: ProofChainArtifact[];
  spent_proof_modules: string[];
}

export interface ProofChainVerdict {
  ok: boolean;
  action: ProofChainAction;
  branch: string;
  proof_modules: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function normalizeModule(value: string): string {
  return value
    .trim()
    .replace(/^node\s+/, "")
    .replace(/^dist\//, "")
    .replace(/^src\//, "")
    .replace(/\.(ts|js)$/, "");
}

function commandModules(command: string): string[] {
  const modules = command
    .split(/&&|;/)
    .map((part) => part.trim())
    .filter((part) => part.startsWith("node "))
    .map(normalizeModule);

  return [...new Set(modules)];
}

function artifactModule(artifact: ProofChainArtifact): string {
  return normalizeModule(artifact.proof_module);
}

function missingArtifactFields(artifact: ProofChainArtifact): string[] {
  const failures: string[] = [];

  if (!artifact.artifact_id.trim()) failures.push("proof artifact has no artifact id");
  if (!artifact.source_path.trim()) failures.push(`proof artifact ${artifact.artifact_id || "<unknown>"} has no source path`);
  if (!artifact.proof_module.trim()) failures.push(`proof artifact ${artifact.artifact_id || "<unknown>"} has no proof module`);
  if (!artifact.route_gain.trim()) failures.push(`proof artifact ${artifact.artifact_id || "<unknown>"} has no route gain`);

  return failures;
}

export function compileProofChain(input: ProofChainInput): ProofChainVerdict {
  const proofModules = commandModules(input.proof_script_command);
  const base = {
    branch: input.branch,
    proof_modules: proofModules,
  };

  if (input.branch !== input.active_branch) {
    return {
      ...base,
      ok: false,
      action: "block_release",
      decisive_evidence: [],
      blockers: [`proof chain branch ${input.branch} does not match active branch ${input.active_branch}`],
      next_route: "rebind the proof chain to the active PR branch before release",
    };
  }

  if (input.required_artifacts.length === 0) {
    return {
      ...base,
      ok: false,
      action: "block_release",
      decisive_evidence: [],
      blockers: ["proof chain has no required proof artifacts"],
      next_route: "attach at least one executable proof artifact before claiming proof-chain readiness",
    };
  }

  const blockers: string[] = [];
  const requiredModules = input.required_artifacts.map(artifactModule);
  const spentModules = new Set(input.spent_proof_modules.map(normalizeModule));

  for (const artifact of input.required_artifacts) {
    blockers.push(...missingArtifactFields(artifact));
  }

  for (const moduleName of requiredModules) {
    if (!proofModules.includes(moduleName)) {
      blockers.push(`required proof module is not executed by proof script: ${moduleName}`);
    }
    if (spentModules.has(moduleName)) {
      blockers.push(`proof module is already spent and cannot be counted as new proof-chain progress: ${moduleName}`);
    }
  }

  const requiredSet = new Set(requiredModules);
  for (const moduleName of proofModules) {
    if (moduleName.endsWith("-proof") && !requiredSet.has(moduleName)) {
      blockers.push(`proof script executes an unregistered proof module: ${moduleName}`);
    }
  }

  if (blockers.length > 0) {
    return {
      ...base,
      ok: false,
      action: "repair_proof_chain",
      decisive_evidence: proofModules,
      blockers,
      next_route: "repair proof-script wiring before treating proof examples as a complete status surface",
    };
  }

  return {
    ...base,
    ok: true,
    action: "proof_chain_ready",
    decisive_evidence: [
      ...input.required_artifacts.map((artifact) => `${artifact.artifact_id}: ${artifact.source_path} -> ${artifactModule(artifact)}`),
      ...input.required_artifacts.map((artifact) => artifact.route_gain),
    ],
    blockers: [],
    next_route: "run the complete proof chain, then bind any status readback to the moved PR head",
  };
}
