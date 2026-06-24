export type EmbodimentNoveltyAxis =
  | "behavior_surface"
  | "routing_effect"
  | "artifact_class"
  | "execution_phase"
  | "source_path"
  | "failure_reduction";

export type EmbodimentNoveltyAction =
  | "admit_novel_embodiment"
  | "block_branch_mismatch"
  | "block_non_embodiment_move"
  | "block_no_behavior_file"
  | "block_repeated_family"
  | "block_insufficient_novelty";

export interface SpentEmbodimentFamily {
  family_id: string;
  artifact_class: string;
  move_class: string;
  execution_phase: string;
  behavior_surfaces: string[];
  routing_effects: string[];
  source_paths: string[];
  failure_reductions: string[];
}

export interface EmbodimentNoveltyCandidate {
  candidate_id: string;
  branch: string;
  active_branch: string;
  live_head_sha: string;
  move_class: string;
  artifact_class: string;
  execution_phase: string;
  changed_files: string[];
  behavior_surfaces: string[];
  executable_artifacts: string[];
  routing_effects: string[];
  source_paths: string[];
  failure_reductions: string[];
  proof_artifacts: string[];
}

export interface EmbodimentNoveltyInput {
  candidate: EmbodimentNoveltyCandidate;
  spent_families: SpentEmbodimentFamily[];
  minimum_novel_axes?: number;
}

export interface EmbodimentNoveltyVerdict {
  ok: boolean;
  action: EmbodimentNoveltyAction;
  candidate_id: string;
  branch: string;
  head_sha: string;
  novel_axes: EmbodimentNoveltyAxis[];
  repeated_family_ids: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const DEFAULT_MINIMUM_NOVEL_AXES = 2;

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function executableBehaviorFile(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    /\.(ts|js|mjs|json)$/.test(path) &&
    !/(?:\.test|-proof)\.ts$/.test(path)
  );
}

function hasIntersection(left: string[], right: string[]): boolean {
  const rightSet = new Set(unique(right));
  return unique(left).some((value) => rightSet.has(value));
}

function allValuesSeen(values: string[], spentValues: string[]): boolean {
  const normalized = unique(values);
  if (normalized.length === 0) return true;
  const spent = new Set(unique(spentValues));
  return normalized.every((value) => spent.has(value));
}

function collectSpent<T extends keyof SpentEmbodimentFamily>(
  families: SpentEmbodimentFamily[],
  key: T,
): SpentEmbodimentFamily[T][] {
  return families.map((family) => family[key]);
}

function flatten(values: string[][]): string[] {
  return values.flatMap((value) => value);
}

function repeatedFamilies(candidate: EmbodimentNoveltyCandidate, families: SpentEmbodimentFamily[]): SpentEmbodimentFamily[] {
  return families.filter(
    (family) =>
      family.artifact_class === candidate.artifact_class &&
      family.execution_phase === candidate.execution_phase &&
      hasIntersection(candidate.behavior_surfaces, family.behavior_surfaces) &&
      hasIntersection(candidate.routing_effects, family.routing_effects),
  );
}

function noveltyAxes(candidate: EmbodimentNoveltyCandidate, families: SpentEmbodimentFamily[]): EmbodimentNoveltyAxis[] {
  const axes: EmbodimentNoveltyAxis[] = [];
  const spentArtifactClasses = new Set(collectSpent(families, "artifact_class"));
  const spentExecutionPhases = new Set(collectSpent(families, "execution_phase"));
  const spentBehaviorSurfaces = flatten(collectSpent(families, "behavior_surfaces"));
  const spentRoutingEffects = flatten(collectSpent(families, "routing_effects"));
  const spentSourcePaths = flatten(collectSpent(families, "source_paths"));
  const spentFailureReductions = flatten(collectSpent(families, "failure_reductions"));

  if (!spentArtifactClasses.has(candidate.artifact_class)) axes.push("artifact_class");
  if (!spentExecutionPhases.has(candidate.execution_phase)) axes.push("execution_phase");
  if (!allValuesSeen(candidate.behavior_surfaces, spentBehaviorSurfaces)) axes.push("behavior_surface");
  if (!allValuesSeen(candidate.routing_effects, spentRoutingEffects)) axes.push("routing_effect");
  if (!allValuesSeen(candidate.source_paths, spentSourcePaths)) axes.push("source_path");
  if (!allValuesSeen(candidate.failure_reductions, spentFailureReductions)) axes.push("failure_reduction");

  return axes;
}

function block(
  candidate: EmbodimentNoveltyCandidate,
  action: Exclude<EmbodimentNoveltyAction, "admit_novel_embodiment">,
  blockers: string[],
  nextRoute: string,
  families: SpentEmbodimentFamily[],
): EmbodimentNoveltyVerdict {
  return {
    ok: false,
    action,
    candidate_id: candidate.candidate_id,
    branch: candidate.active_branch,
    head_sha: candidate.live_head_sha,
    novel_axes: noveltyAxes(candidate, families),
    repeated_family_ids: repeatedFamilies(candidate, families).map((family) => family.family_id),
    decisive_evidence: [],
    blockers,
    next_route: nextRoute,
  };
}

export function evaluateEmbodimentNovelty(input: EmbodimentNoveltyInput): EmbodimentNoveltyVerdict {
  const { candidate, spent_families } = input;
  const minimumNovelAxes = input.minimum_novel_axes ?? DEFAULT_MINIMUM_NOVEL_AXES;

  if (candidate.branch !== candidate.active_branch) {
    return block(
      candidate,
      "block_branch_mismatch",
      [`candidate branch ${candidate.branch} does not match active branch ${candidate.active_branch}`],
      "bind the embodiment candidate to the active PR branch before release",
      spent_families,
    );
  }

  if (candidate.move_class !== "external_platform_embodiment") {
    return block(
      candidate,
      "block_non_embodiment_move",
      [`candidate move class is not external platform embodiment: ${candidate.move_class}`],
      "choose executable embodiment or emit one exact external blocker",
      spent_families,
    );
  }

  const behaviorFiles = candidate.changed_files.filter(executableBehaviorFile);
  if (behaviorFiles.length === 0) {
    return block(
      candidate,
      "block_no_behavior_file",
      ["candidate changes no behavior-bearing executable platform file"],
      "add a non-proof executable platform surface before claiming embodiment progress",
      spent_families,
    );
  }

  const repeated = repeatedFamilies(candidate, spent_families);
  if (repeated.length > 0) {
    return block(
      candidate,
      "block_repeated_family",
      repeated.map((family) => `candidate repeats spent embodiment family ${family.family_id}`),
      "change the artifact family, execution phase, behavior surface, or routing effect before release",
      spent_families,
    );
  }

  const axes = noveltyAxes(candidate, spent_families);
  if (axes.length < minimumNovelAxes) {
    return block(
      candidate,
      "block_insufficient_novelty",
      [`candidate exposes ${axes.length} novel axes; minimum required is ${minimumNovelAxes}`],
      "synthesize a multi-axis embodiment increment or emit one exact external blocker",
      spent_families,
    );
  }

  return {
    ok: true,
    action: "admit_novel_embodiment",
    candidate_id: candidate.candidate_id,
    branch: candidate.active_branch,
    head_sha: candidate.live_head_sha,
    novel_axes: axes,
    repeated_family_ids: [],
    decisive_evidence: [
      ...behaviorFiles,
      ...unique(candidate.behavior_surfaces),
      ...unique(candidate.executable_artifacts),
      ...unique(candidate.routing_effects),
      ...unique(candidate.source_paths),
      ...unique(candidate.failure_reductions),
      ...unique(candidate.proof_artifacts),
    ],
    blockers: [],
    next_route: "commit the novel embodiment, then require the next increment to prove a different novelty vector",
  };
}
