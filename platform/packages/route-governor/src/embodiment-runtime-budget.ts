export type RuntimeBudgetAction =
  | "admit_runtime_embodiment"
  | "allow_one_more_governor"
  | "block_guard_saturation"
  | "block_spent_artifact_class";

export type EmbodimentArtifactKind =
  | "runtime"
  | "executor"
  | "adapter"
  | "proof"
  | "governor"
  | "status"
  | "documentation";

export interface EmbodimentRuntimeBudgetInput {
  branch: string;
  active_branch: string;
  head_sha: string;
  candidate_artifact_class: string;
  spent_artifact_classes: string[];
  recent_artifact_kinds: EmbodimentArtifactKind[];
  changed_files: string[];
  runtime_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  max_consecutive_governors: number;
}

export interface EmbodimentRuntimeBudgetVerdict {
  ok: boolean;
  action: RuntimeBudgetAction;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const RUNTIME_KINDS = new Set<EmbodimentArtifactKind>(["runtime", "executor", "adapter"]);
const GOVERNOR_ONLY_KINDS = new Set<EmbodimentArtifactKind>(["governor", "status", "documentation", "proof"]);

function executablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function consecutiveGovernorOnlyKinds(kinds: EmbodimentArtifactKind[]): number {
  let count = 0;
  for (let index = kinds.length - 1; index >= 0; index -= 1) {
    const kind = kinds[index];
    if (!GOVERNOR_ONLY_KINDS.has(kind)) break;
    count += 1;
  }
  return count;
}

function hasRuntimeKind(kinds: EmbodimentArtifactKind[]): boolean {
  return kinds.some((kind) => RUNTIME_KINDS.has(kind));
}

function hasRuntimePath(paths: string[]): boolean {
  return paths.some((path) => path.startsWith("platform/packages/") && path.includes("runtime"));
}

function base(input: EmbodimentRuntimeBudgetInput): Pick<EmbodimentRuntimeBudgetVerdict, "branch" | "head_sha"> {
  return { branch: input.branch, head_sha: input.head_sha };
}

export function compileEmbodimentRuntimeBudget(
  input: EmbodimentRuntimeBudgetInput,
): EmbodimentRuntimeBudgetVerdict {
  const baseFields = base(input);

  if (input.branch !== input.active_branch) {
    return {
      ...baseFields,
      ok: false,
      action: "block_guard_saturation",
      decisive_evidence: [],
      blockers: [`candidate branch ${input.branch} does not match active branch ${input.active_branch}`],
      next_route: "rebind the embodiment budget to the active PR branch before continuing",
    };
  }

  if (input.spent_artifact_classes.includes(input.candidate_artifact_class)) {
    return {
      ...baseFields,
      ok: false,
      action: "block_spent_artifact_class",
      decisive_evidence: [],
      blockers: [`artifact class already spent: ${input.candidate_artifact_class}`],
      next_route: "choose a materially new artifact class before moving the PR head again",
    };
  }

  const governorRunLength = consecutiveGovernorOnlyKinds(input.recent_artifact_kinds);
  const candidateHasRuntime = hasRuntimeKind(input.recent_artifact_kinds) || input.runtime_artifacts.length > 0 || hasRuntimePath(input.changed_files);

  if (candidateHasRuntime) {
    const blockers: string[] = [];
    if (!input.changed_files.some(executablePlatformPath)) {
      blockers.push("runtime embodiment must change executable platform files");
    }
    if (input.runtime_artifacts.length === 0) {
      blockers.push("runtime embodiment requires a named runtime artifact");
    }
    if (input.proof_artifacts.length === 0) {
      blockers.push("runtime embodiment requires a proof artifact");
    }

    if (blockers.length > 0) {
      return {
        ...baseFields,
        ok: false,
        action: "block_guard_saturation",
        decisive_evidence: [],
        blockers,
        next_route: "complete the runtime artifact and proof before publishing the embodiment increment",
      };
    }

    return {
      ...baseFields,
      ok: true,
      action: "admit_runtime_embodiment",
      decisive_evidence: [
        input.candidate_artifact_class,
        ...input.changed_files.filter(executablePlatformPath),
        ...input.runtime_artifacts,
        ...input.routing_artifacts,
        ...input.proof_artifacts,
      ],
      blockers: [],
      next_route: "commit the runtime embodiment and then read only the new head status surface",
    };
  }

  if (governorRunLength >= input.max_consecutive_governors) {
    return {
      ...baseFields,
      ok: false,
      action: "block_guard_saturation",
      decisive_evidence: [`${governorRunLength} consecutive non-runtime embodiment artifacts`],
      blockers: ["next embodiment must introduce runtime, executor, or adapter behavior before another guard-only artifact"],
      next_route: "build the first runtime execution surface instead of adding another routing guard",
    };
  }

  return {
    ...baseFields,
    ok: true,
    action: "allow_one_more_governor",
    decisive_evidence: [
      `${governorRunLength} consecutive non-runtime embodiment artifacts remains under budget ${input.max_consecutive_governors}`,
      input.candidate_artifact_class,
      ...input.routing_artifacts,
      ...input.proof_artifacts,
    ],
    blockers: [],
    next_route: "one more governor-class artifact is allowed, but runtime embodiment remains the preferred next class",
  };
}
