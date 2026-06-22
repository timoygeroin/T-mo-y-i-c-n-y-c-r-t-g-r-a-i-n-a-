export type BehaviorProofManifestGateAction =
  | "accept_behavior_proof_manifest_gate"
  | "repair_behavior_proof_manifest_gate"
  | "block_behavior_proof_manifest_gate";

export interface ProofManifestModule {
  module_id: string;
  source_path: string;
  behavior_exports: string[];
  proof_paths: string[];
  required: boolean;
}

export interface BehaviorProofManifestGateInput {
  active_branch: string;
  branch: string;
  modules: ProofManifestModule[];
  root_exports: string[];
  proof_command: string;
  test_command: string;
  spent_module_ids: string[];
}

export interface BehaviorProofManifestGateVerdict {
  ok: boolean;
  action: BehaviorProofManifestGateAction;
  branch: string;
  admitted_module_ids: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function executableBehaviorPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/route-governor/src/") &&
    /\.(?:ts|js|mjs)$/.test(path) &&
    !/(?:\.test|-proof)\.ts$/.test(path) &&
    !path.endsWith("/index.ts")
  );
}

function commandMentions(command: string, path: string): boolean {
  const distPath = path
    .replace("platform/packages/route-governor/src/", "dist/")
    .replace(/\.ts$/, ".js");
  return command.includes(path) || command.includes(distPath);
}

function moduleEvidence(module: ProofManifestModule): string[] {
  return [
    module.module_id || "<missing-module-id>",
    module.source_path,
    ...module.behavior_exports,
    ...module.proof_paths,
  ];
}

function moduleBlockers(
  module: ProofManifestModule,
  input: BehaviorProofManifestGateInput,
): string[] {
  const blockers: string[] = [];
  const label = module.module_id || module.source_path || "<unknown-module>";

  if (!module.module_id.trim()) blockers.push("behavior proof manifest module has no id");
  if (!executableBehaviorPath(module.source_path)) {
    blockers.push(`behavior proof manifest module is not a behavior source: ${label}`);
  }
  if (input.spent_module_ids.includes(module.module_id)) {
    blockers.push(`behavior proof manifest module already spent: ${module.module_id}`);
  }
  if (module.behavior_exports.length === 0) {
    blockers.push(`behavior proof manifest module has no behavior export: ${label}`);
  }

  const hiddenExports = module.behavior_exports.filter((exportName) => !input.root_exports.includes(exportName));
  blockers.push(...hiddenExports.map((exportName) => `behavior export missing from root index: ${exportName}`));

  if (module.proof_paths.length === 0) {
    blockers.push(`behavior proof manifest module has no proof or test path: ${label}`);
  }

  for (const proofPath of module.proof_paths) {
    const proofVisible = commandMentions(input.proof_command, proofPath) || commandMentions(input.test_command, proofPath);
    if (!proofVisible) blockers.push(`behavior proof manifest path is not command-visible: ${proofPath}`);
  }

  return blockers;
}

export function compileBehaviorProofManifestGate(
  input: BehaviorProofManifestGateInput,
): BehaviorProofManifestGateVerdict {
  const blockers: string[] = [];
  const decisiveEvidence: string[] = [];
  const admittedModuleIds: string[] = [];

  if (input.branch !== input.active_branch) {
    blockers.push(`behavior proof manifest branch ${input.branch} does not match active branch ${input.active_branch}`);
  }

  const requiredModules = input.modules.filter((module) => module.required);
  if (requiredModules.length === 0) {
    blockers.push("behavior proof manifest has no required behavior modules");
  }

  for (const module of requiredModules) {
    decisiveEvidence.push(...moduleEvidence(module));
    const moduleFailures = moduleBlockers(module, input);
    if (moduleFailures.length === 0) admittedModuleIds.push(module.module_id);
    blockers.push(...moduleFailures);
  }

  if (blockers.length > 0) {
    return {
      ok: false,
      action: input.branch === input.active_branch ? "repair_behavior_proof_manifest_gate" : "block_behavior_proof_manifest_gate",
      branch: input.branch,
      admitted_module_ids: admittedModuleIds,
      decisive_evidence: decisiveEvidence,
      blockers,
      next_route:
        "wire each required behavior module through root export and proof/test command visibility before counting the embodiment as covered",
    };
  }

  return {
    ok: true,
    action: "accept_behavior_proof_manifest_gate",
    branch: input.branch,
    admitted_module_ids: admittedModuleIds,
    decisive_evidence: decisiveEvidence,
    blockers: [],
    next_route:
      "future embodiment modules must enter this manifest before they can be treated as proof-covered platform behavior",
  };
}
