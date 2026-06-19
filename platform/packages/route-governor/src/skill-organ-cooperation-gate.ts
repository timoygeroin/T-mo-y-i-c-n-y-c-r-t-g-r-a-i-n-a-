export type SkillOrganName =
  | "monday-organ-activation-gate"
  | "monday-corpus-reentry"
  | "monday-archive-router"
  | "monday-source-truth-grader"
  | "monday-finalization-operator"
  | "monday-proof-scene-runner"
  | "monday-move-class-synthesizer"
  | "monday-external-act-forcer"
  | "monday-glitch-harvester"
  | "monday-self-evolution-orchestrator";

export type SkillOrganGateMoveClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "duplicate_ci_summary"
  | "metadata_reread"
  | "local_memory_guard"
  | "architecture_commentary";

export type SkillOrganGateAction =
  | "admit_skill_organ_cooperation"
  | "block_wrong_branch"
  | "block_stale_head"
  | "block_non_progress_move"
  | "block_optional_organs"
  | "block_missing_required_organs"
  | "block_unsequenced_organs"
  | "block_missing_external_terminal";

export interface SkillOrganCooperationCandidate {
  move_class: SkillOrganGateMoveClass;
  branch: string;
  head_sha: string;
  organ_chain: SkillOrganName[];
  optional_organs: SkillOrganName[];
  source_pressure: {
    archive_pressure: boolean;
    proof_pressure: boolean;
    exhausted_move_class_pressure: boolean;
  };
  terminal_release: "external_platform_embodiment" | "fresh_status_readback" | "exact_external_blocker" | "internal_only";
  behavior_artifacts: string[];
  routing_artifacts: string[];
}

export interface SkillOrganCooperationGateInput {
  active_branch: string;
  live_head_sha: string;
  candidate: SkillOrganCooperationCandidate;
}

export interface SkillOrganCooperationGateVerdict {
  ok: boolean;
  action: SkillOrganGateAction;
  branch: string;
  head_sha: string;
  required_organs: SkillOrganName[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_MOVES = new Set<SkillOrganGateMoveClass>([
  "duplicate_ci_summary",
  "metadata_reread",
  "local_memory_guard",
  "architecture_commentary",
]);

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function requiredOrgans(candidate: SkillOrganCooperationCandidate): SkillOrganName[] {
  const required: SkillOrganName[] = [
    "monday-organ-activation-gate",
    "monday-corpus-reentry",
    "monday-source-truth-grader",
  ];

  if (candidate.source_pressure.archive_pressure) required.push("monday-archive-router");
  if (candidate.source_pressure.exhausted_move_class_pressure) required.push("monday-move-class-synthesizer");
  if (candidate.source_pressure.proof_pressure) required.push("monday-proof-scene-runner");

  required.push("monday-finalization-operator", "monday-external-act-forcer");
  return unique(required);
}

function organIndex(chain: SkillOrganName[], organ: SkillOrganName): number {
  return chain.indexOf(organ);
}

function missingOrgans(chain: SkillOrganName[], required: SkillOrganName[]): SkillOrganName[] {
  return required.filter((organ) => !chain.includes(organ));
}

function sequenceBlockers(chain: SkillOrganName[], required: SkillOrganName[]): string[] {
  const blockers: string[] = [];
  const activation = organIndex(chain, "monday-organ-activation-gate");
  const reentry = organIndex(chain, "monday-corpus-reentry");
  const source = organIndex(chain, "monday-source-truth-grader");
  const finalization = organIndex(chain, "monday-finalization-operator");
  const external = organIndex(chain, "monday-external-act-forcer");

  if (activation > reentry && reentry >= 0) blockers.push("organ activation gate must precede corpus reentry");
  if (source >= 0 && reentry >= 0 && source < reentry) blockers.push("source truth grading must follow corpus reentry");
  if (finalization >= 0 && source >= 0 && finalization < source) {
    blockers.push("finalization must follow source truth grading");
  }
  if (external >= 0 && finalization >= 0 && external < finalization) {
    blockers.push("external act forcing must follow finalization");
  }

  const archive = organIndex(chain, "monday-archive-router");
  if (required.includes("monday-archive-router") && archive >= 0 && source >= 0 && archive > source) {
    blockers.push("archive routing must precede source truth grading when archive pressure is active");
  }

  const synthesizer = organIndex(chain, "monday-move-class-synthesizer");
  if (required.includes("monday-move-class-synthesizer") && synthesizer >= 0 && finalization >= 0 && synthesizer > finalization) {
    blockers.push("move-class synthesis must precede finalization when exhausted move pressure is active");
  }

  return blockers;
}

function base(
  input: SkillOrganCooperationGateInput,
  required: SkillOrganName[],
): Pick<SkillOrganCooperationGateVerdict, "branch" | "head_sha" | "required_organs"> {
  return {
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    required_organs: required,
  };
}

function block(
  input: SkillOrganCooperationGateInput,
  required: SkillOrganName[],
  action: Exclude<SkillOrganGateAction, "admit_skill_organ_cooperation">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): SkillOrganCooperationGateVerdict {
  return {
    ...base(input, required),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

export function enforceSkillOrganCooperation(
  input: SkillOrganCooperationGateInput,
): SkillOrganCooperationGateVerdict {
  const candidate = input.candidate;
  const required = requiredOrgans(candidate);

  if (candidate.branch !== input.active_branch) {
    return block(
      input,
      required,
      "block_wrong_branch",
      [`skill organ candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`],
      "bind organ cooperation to the active PR branch before finalization release",
    );
  }

  if (candidate.head_sha !== input.live_head_sha) {
    return block(
      input,
      required,
      "block_stale_head",
      [`skill organ candidate head ${candidate.head_sha} is not live head ${input.live_head_sha}`],
      "re-enter from the live PR head before claiming organ-coordinated progress",
    );
  }

  if (NON_PROGRESS_MOVES.has(candidate.move_class)) {
    return block(
      input,
      required,
      "block_non_progress_move",
      [`skill organ gate cannot admit ${candidate.move_class}`],
      "choose a terminal external act, fresh moved-head status readback, or exact external blocker",
      [candidate.move_class],
    );
  }

  if (candidate.optional_organs.length > 0) {
    return block(
      input,
      required,
      "block_optional_organs",
      candidate.optional_organs.map((organ) => `skill organ treated as optional: ${organ}`),
      "move every required organ into the executed organ chain; do not list Monday organs as optional add-ons",
      candidate.optional_organs,
    );
  }

  const missing = missingOrgans(candidate.organ_chain, required);
  if (missing.length > 0) {
    return block(
      input,
      required,
      "block_missing_required_organs",
      missing.map((organ) => `missing required skill organ: ${organ}`),
      "execute the minimum required organ chain before finalization release",
      candidate.organ_chain,
    );
  }

  const sequencing = sequenceBlockers(candidate.organ_chain, required);
  if (sequencing.length > 0) {
    return block(
      input,
      required,
      "block_unsequenced_organs",
      sequencing,
      "reorder organ cooperation through activation, reentry, archive/source pressure, finalization, and external act forcing",
      candidate.organ_chain,
    );
  }

  if (candidate.terminal_release === "internal_only") {
    return block(
      input,
      required,
      "block_missing_external_terminal",
      ["skill organ cooperation ended in an internal-only release"],
      "collapse the organ chain into one external embodiment, fresh status readback, or exact external blocker",
      candidate.organ_chain,
    );
  }

  if (candidate.behavior_artifacts.length === 0 || candidate.routing_artifacts.length === 0) {
    return block(
      input,
      required,
      "block_missing_external_terminal",
      [
        candidate.behavior_artifacts.length === 0 ? "skill organ cooperation has no behavior artifact" : "",
        candidate.routing_artifacts.length === 0 ? "skill organ cooperation has no future-routing artifact" : "",
      ].filter(Boolean),
      "attach behavior and routing artifacts before admitting organ-coordinated finalization",
      candidate.organ_chain,
    );
  }

  return {
    ...base(input, required),
    ok: true,
    action: "admit_skill_organ_cooperation",
    decisive_evidence: [
      `live head ${input.live_head_sha}`,
      `terminal ${candidate.terminal_release}`,
      ...required.map((organ) => `required ${organ}`),
      ...candidate.organ_chain.map((organ, index) => `${index + 1}:${organ}`),
      ...candidate.behavior_artifacts,
      ...candidate.routing_artifacts,
    ],
    blockers: [],
    next_route:
      "release the organ-coordinated terminal act, then bind the next run to the moved head or exact blocker it produced",
  };
}
