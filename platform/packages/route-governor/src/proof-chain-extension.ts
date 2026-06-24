export type ProofChainExtensionAction = "accept_extension" | "repair_extension" | "block_extension";

export interface ProofChainExtensionArtifact {
  artifact_id: string;
  source_path: string;
  proof_module: string;
  route_gain: string;
}

export interface ProofChainExtensionInput {
  branch: string;
  active_branch: string;
  candidate: ProofChainExtensionArtifact;
  changed_files: string[];
  proof_script_command: string;
  proof_registry_artifacts: ProofChainExtensionArtifact[];
  spent_artifact_classes: string[];
  artifact_class: string;
}

export interface ProofChainExtensionVerdict {
  ok: boolean;
  action: ProofChainExtensionAction;
  branch: string;
  artifact_id: string;
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
  return [
    ...new Set(
      command
        .split(/&&|;/)
        .map((part) => part.trim())
        .filter((part) => part.startsWith("node "))
        .map(normalizeModule),
    ),
  ];
}

function registryHasCandidate(
  registry: ProofChainExtensionArtifact[],
  candidate: ProofChainExtensionArtifact,
): boolean {
  const candidateModule = normalizeModule(candidate.proof_module);

  return registry.some(
    (artifact) =>
      artifact.artifact_id === candidate.artifact_id &&
      artifact.source_path === candidate.source_path &&
      normalizeModule(artifact.proof_module) === candidateModule &&
      artifact.route_gain.trim().length > 0,
  );
}

function candidateFields(candidate: ProofChainExtensionArtifact): string[] {
  const blockers: string[] = [];

  if (!candidate.artifact_id.trim()) blockers.push("candidate proof artifact has no artifact id");
  if (!candidate.source_path.trim()) blockers.push("candidate proof artifact has no source path");
  if (!candidate.proof_module.trim()) blockers.push("candidate proof artifact has no proof module");
  if (!candidate.route_gain.trim()) blockers.push("candidate proof artifact has no route gain");

  return blockers;
}

export function compileProofChainExtension(input: ProofChainExtensionInput): ProofChainExtensionVerdict {
  const candidateModule = normalizeModule(input.candidate.proof_module);
  const modules = commandModules(input.proof_script_command);
  const blockers = candidateFields(input.candidate);

  if (input.branch !== input.active_branch) {
    blockers.push(`proof-chain extension branch ${input.branch} does not match active branch ${input.active_branch}`);
  }

  if (input.spent_artifact_classes.includes(input.artifact_class)) {
    blockers.push(`proof-chain extension artifact class is already spent: ${input.artifact_class}`);
  }

  if (!input.changed_files.includes(input.candidate.source_path)) {
    blockers.push(`extension source file was not changed: ${input.candidate.source_path}`);
  }

  const proofSourcePath = input.candidate.proof_module.replace(/^dist\//, "platform/packages/route-governor/src/").replace(/\.js$/, ".ts");
  if (!input.changed_files.includes(proofSourcePath)) {
    blockers.push(`extension proof source file was not changed: ${proofSourcePath}`);
  }

  if (!modules.includes(candidateModule)) {
    blockers.push(`extension proof module is not executed by proof script: ${candidateModule}`);
  }

  if (!registryHasCandidate(input.proof_registry_artifacts, input.candidate)) {
    blockers.push(`extension proof artifact is not registered in proof-chain proof surface: ${input.candidate.artifact_id}`);
  }

  if (blockers.length > 0) {
    return {
      ok: false,
      action: input.branch === input.active_branch ? "repair_extension" : "block_extension",
      branch: input.branch,
      artifact_id: input.candidate.artifact_id,
      decisive_evidence: modules,
      blockers,
      next_route: "wire the extension source, proof module, proof script, and proof-chain registry before claiming progress",
    };
  }

  return {
    ok: true,
    action: "accept_extension",
    branch: input.branch,
    artifact_id: input.candidate.artifact_id,
    decisive_evidence: [
      input.candidate.source_path,
      proofSourcePath,
      candidateModule,
      input.candidate.route_gain,
    ],
    blockers: [],
    next_route: "commit the proof-chain extension, then bind the next status readback to the moved PR head",
  };
}
