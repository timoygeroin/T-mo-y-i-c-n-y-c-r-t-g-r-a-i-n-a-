export type EmbodimentProgressionAction =
  | "accept_progression"
  | "block_branch_mismatch"
  | "block_stale_head"
  | "block_repeated_artifact_class"
  | "block_incomplete_progression";

export interface EmbodimentProgressionInput {
  branch: string;
  active_branch: string;
  prior_head_sha: string;
  live_head_sha: string;
  artifact_class: string;
  spent_artifact_classes: string[];
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_modules: string[];
  proof_script_modules: string[];
}

export interface EmbodimentProgressionVerdict {
  ok: boolean;
  action: EmbodimentProgressionAction;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function base(input: EmbodimentProgressionInput): Pick<EmbodimentProgressionVerdict, "branch" | "head_sha"> {
  return { branch: input.branch, head_sha: input.live_head_sha };
}

function normalizeModule(moduleName: string): string {
  return moduleName
    .trim()
    .replace(/^node\s+/, "")
    .replace(/^dist\//, "")
    .replace(/^src\//, "")
    .replace(/\.(ts|js)$/, "");
}

function isExecutablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function block(
  input: EmbodimentProgressionInput,
  action: Exclude<EmbodimentProgressionAction, "accept_progression">,
  blockers: string[],
  nextRoute: string,
): EmbodimentProgressionVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: [],
    blockers,
    next_route: nextRoute,
  };
}

function progressionBlockers(input: EmbodimentProgressionInput): string[] {
  const blockers: string[] = [];
  const normalizedProofModules = input.proof_modules.map(normalizeModule);
  const normalizedProofScriptModules = input.proof_script_modules.map(normalizeModule);

  if (!input.artifact_class.trim()) {
    blockers.push("embodiment progression has no artifact class");
  }
  if (!input.changed_files.some(isExecutablePlatformPath)) {
    blockers.push("embodiment progression does not change executable platform files");
  }
  if (input.executable_artifacts.length === 0) {
    blockers.push("embodiment progression has no executable artifact evidence");
  }
  if (input.routing_artifacts.length === 0) {
    blockers.push("embodiment progression has no future-routing artifact evidence");
  }
  if (normalizedProofModules.length === 0) {
    blockers.push("embodiment progression has no proof module");
  }

  for (const proofModule of normalizedProofModules) {
    if (!normalizedProofScriptModules.includes(proofModule)) {
      blockers.push(`proof module is not wired into the proof script: ${proofModule}`);
    }
  }

  return blockers;
}

export function compileEmbodimentProgressionContract(
  input: EmbodimentProgressionInput,
): EmbodimentProgressionVerdict {
  if (input.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`embodiment progression branch ${input.branch} does not match active branch ${input.active_branch}`],
      "rebind the embodiment progression to the active PR branch before release",
    );
  }

  if (input.live_head_sha === input.prior_head_sha) {
    return block(
      input,
      "block_stale_head",
      [`embodiment progression did not move the live head ${input.live_head_sha}`],
      "move the branch with a new executable embodiment before claiming progression",
    );
  }

  if (input.spent_artifact_classes.includes(input.artifact_class)) {
    return block(
      input,
      "block_repeated_artifact_class",
      [`embodiment progression repeats spent artifact class: ${input.artifact_class}`],
      "choose a new executable artifact class rather than replaying the last branch movement",
    );
  }

  const blockers = progressionBlockers(input);
  if (blockers.length > 0) {
    return block(
      input,
      "block_incomplete_progression",
      blockers,
      "attach executable files, route evidence, and proof-script wiring before release",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "accept_progression",
    decisive_evidence: [
      `head moved from ${input.prior_head_sha} to ${input.live_head_sha}`,
      input.artifact_class,
      ...input.changed_files.filter(isExecutablePlatformPath),
      ...input.executable_artifacts,
      ...input.routing_artifacts,
      ...input.proof_modules.map(normalizeModule),
    ],
    blockers: [],
    next_route: "after this executable progression commit, read only status surfaces bound to the new PR head",
  };
}
