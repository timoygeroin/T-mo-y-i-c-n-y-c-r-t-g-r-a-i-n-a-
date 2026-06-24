export type ProcessorLoadIntakeClass =
  | "corpus_reentry"
  | "archive_ingress"
  | "source_truth_grading"
  | "move_class_synthesis"
  | "proof_scene"
  | "external_act_forcing";

export type ProcessorLoadIntakeSourceTier =
  | "direct_current_instruction"
  | "direct_archive"
  | "archive_derived"
  | "memory"
  | "model_summary";

export type ProcessorLoadIntakeRequiredOutput =
  | "ledger_delta"
  | "route_attack"
  | "candidate_mechanism"
  | "omission_warning"
  | "proof_pressure";

export type ProcessorLoadIntakeAction =
  | "admit_processor_loads"
  | "block_missing_scene"
  | "block_missing_convergence_rule"
  | "block_empty_load_set"
  | "block_unbounded_load_set"
  | "block_reused_load"
  | "block_wrong_branch"
  | "block_wrong_head"
  | "block_missing_evidence"
  | "block_model_summary_only"
  | "block_missing_act_forcing_load";

export interface ProcessorLoadIntakeCandidate {
  load_id: string;
  branch: string;
  head_sha: string;
  class: ProcessorLoadIntakeClass;
  source_tier: ProcessorLoadIntakeSourceTier;
  required_output: ProcessorLoadIntakeRequiredOutput;
  evidence: string[];
  semantic_signature: string;
}

export interface ProcessorLoadIntakeInput {
  active_branch: string;
  live_head_sha: string;
  scene_id: string;
  max_processors: number;
  convergence_rule: string;
  spent_load_ids: string[];
  spent_semantic_signatures: string[];
  candidates: ProcessorLoadIntakeCandidate[];
}

export interface AdmittedProcessorLoad {
  load_id: string;
  class: ProcessorLoadIntakeClass;
  source_tier: ProcessorLoadIntakeSourceTier;
  required_output: ProcessorLoadIntakeRequiredOutput;
}

export interface ProcessorLoadIntakeVerdict {
  ok: boolean;
  action: ProcessorLoadIntakeAction;
  scene_id: string | null;
  branch: string;
  head_sha: string;
  loads: AdmittedProcessorLoad[];
  decisive_evidence: string[];
  blockers: string[];
  convergence_rule: string | null;
  next_route: string;
}

const STRONG_SOURCE_TIERS = new Set<ProcessorLoadIntakeSourceTier>([
  "direct_current_instruction",
  "direct_archive",
  "archive_derived",
  "memory",
]);

function normalized(value: string): string {
  return value.trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(normalized).filter(Boolean))];
}

function base(input: ProcessorLoadIntakeInput): Pick<ProcessorLoadIntakeVerdict, "scene_id" | "branch" | "head_sha" | "convergence_rule"> {
  const sceneId = normalized(input.scene_id);
  const convergenceRule = normalized(input.convergence_rule);
  return {
    scene_id: sceneId || null,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    convergence_rule: convergenceRule || null,
  };
}

function block(
  input: ProcessorLoadIntakeInput,
  action: Exclude<ProcessorLoadIntakeAction, "admit_processor_loads">,
  blockers: string[],
  nextRoute: string,
  decisiveEvidence: string[] = [],
): ProcessorLoadIntakeVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    loads: [],
    decisive_evidence: decisiveEvidence,
    blockers,
    next_route: nextRoute,
  };
}

function candidateEvidence(candidate: ProcessorLoadIntakeCandidate): string[] {
  return unique([
    `load ${candidate.load_id}`,
    `class ${candidate.class}`,
    `source ${candidate.source_tier}`,
    `signature ${candidate.semantic_signature}`,
    ...candidate.evidence,
  ]);
}

function candidateBlockers(input: ProcessorLoadIntakeInput, candidate: ProcessorLoadIntakeCandidate): string[] {
  const blockers: string[] = [];
  const loadId = normalized(candidate.load_id);
  const signature = normalized(candidate.semantic_signature);

  if (!loadId) blockers.push("processor load has no id");
  if (input.spent_load_ids.includes(loadId)) blockers.push(`processor load already spent: ${loadId}`);
  if (!signature) blockers.push("processor load has no semantic signature");
  if (input.spent_semantic_signatures.includes(signature)) blockers.push(`processor load signature already spent: ${signature}`);
  if (candidate.branch !== input.active_branch) blockers.push(`processor load branch ${candidate.branch} does not match ${input.active_branch}`);
  if (candidate.head_sha !== input.live_head_sha) blockers.push(`processor load head ${candidate.head_sha} does not match live head ${input.live_head_sha}`);
  if (unique(candidate.evidence).length === 0) blockers.push(`processor load ${loadId || "<missing>"} has no evidence surface`);

  return blockers;
}

export function admitProcessorLoadIntake(input: ProcessorLoadIntakeInput): ProcessorLoadIntakeVerdict {
  const sceneId = normalized(input.scene_id);
  const convergenceRule = normalized(input.convergence_rule);

  if (!sceneId) {
    return block(input, "block_missing_scene", ["processor load intake has no scene id"], "bind intake to the active finalization scene");
  }

  if (!convergenceRule) {
    return block(
      input,
      "block_missing_convergence_rule",
      ["processor load intake has no convergence rule"],
      "name the one-output convergence rule before admitting processor loads",
    );
  }

  if (input.candidates.length === 0) {
    return block(input, "block_empty_load_set", ["processor load intake has no candidates"], "supply bounded processor loads before dispatch");
  }

  if (input.candidates.length > input.max_processors) {
    return block(
      input,
      "block_unbounded_load_set",
      [`${input.candidates.length} load candidates exceed processor budget ${input.max_processors}`],
      "shrink intake to the bounded processor budget before dispatch",
      input.candidates.flatMap(candidateEvidence),
    );
  }

  const perCandidateBlockers = input.candidates.flatMap((candidate) => candidateBlockers(input, candidate));
  if (perCandidateBlockers.length > 0) {
    const reused = perCandidateBlockers.find((item) => item.includes("already spent"));
    const branch = perCandidateBlockers.find((item) => item.includes("branch"));
    const head = perCandidateBlockers.find((item) => item.includes("head"));
    const evidence = perCandidateBlockers.find((item) => item.includes("evidence"));
    const action = reused
      ? "block_reused_load"
      : branch
        ? "block_wrong_branch"
        : head
          ? "block_wrong_head"
          : evidence
            ? "block_missing_evidence"
            : "block_reused_load";
    return block(
      input,
      action,
      perCandidateBlockers,
      "repair processor load identity, live-head binding, and evidence before dispatch",
      input.candidates.flatMap(candidateEvidence),
    );
  }

  const strongLoads = input.candidates.filter((candidate) => STRONG_SOURCE_TIERS.has(candidate.source_tier));
  if (strongLoads.length === 0) {
    return block(
      input,
      "block_model_summary_only",
      ["processor load intake cannot dispatch model-summary-only work"],
      "attach direct-current, direct-archive, archive-derived, or memory-grounded load evidence before dispatch",
      input.candidates.flatMap(candidateEvidence),
    );
  }

  if (!input.candidates.some((candidate) => candidate.class === "external_act_forcing")) {
    return block(
      input,
      "block_missing_act_forcing_load",
      ["processor load intake has no external-act-forcing load"],
      "add an act-forcing load so the fabric cannot settle as analysis-only work",
      input.candidates.flatMap(candidateEvidence),
    );
  }

  const loads = input.candidates.map((candidate) => ({
    load_id: normalized(candidate.load_id),
    class: candidate.class,
    source_tier: candidate.source_tier,
    required_output: candidate.required_output,
  }));

  return {
    ...base(input),
    ok: true,
    action: "admit_processor_loads",
    loads,
    decisive_evidence: input.candidates.flatMap(candidateEvidence),
    blockers: [],
    next_route: "dispatch admitted loads through compileProcessorFabric, then settle only one external act or exact blocker",
  };
}
