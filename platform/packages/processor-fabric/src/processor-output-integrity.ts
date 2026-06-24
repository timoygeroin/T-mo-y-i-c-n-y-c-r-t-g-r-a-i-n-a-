export type ProcessorOutputIntegrityTier =
  | "direct_current_instruction"
  | "direct_archive"
  | "archive_derived"
  | "memory"
  | "model_summary";

export type ProcessorOutputIntegrityClass =
  | "ledger_delta"
  | "route_attack"
  | "candidate_mechanism"
  | "omission_warning"
  | "proof_pressure"
  | "external_act"
  | "exact_blocker";

export type ProcessorOutputIntegrityAction =
  | "admit_processor_output_integrity"
  | "settle_exact_processor_blocker"
  | "block_missing_integrity_id"
  | "block_reused_integrity_id"
  | "block_wrong_branch"
  | "block_wrong_head"
  | "block_missing_required_processor"
  | "block_duplicate_processor_output"
  | "block_missing_output"
  | "block_missing_evidence"
  | "block_weak_source_tier"
  | "block_recycled_signature"
  | "block_unresolved_processor_blocker";

export interface ProcessorOutputIntegrityCandidate {
  processor_id: string;
  load_id: string;
  branch: string;
  head_sha: string;
  output_class: ProcessorOutputIntegrityClass;
  output: string;
  evidence: string[];
  source_tiers: ProcessorOutputIntegrityTier[];
  semantic_signature: string;
  blockers: string[];
}

export interface ProcessorOutputIntegrityInput {
  active_branch: string;
  live_head_sha: string;
  integrity_id: string;
  spent_integrity_ids: string[];
  spent_semantic_signatures: string[];
  required_processor_ids: string[];
  minimum_source_tier: Exclude<ProcessorOutputIntegrityTier, "model_summary">;
  candidates: ProcessorOutputIntegrityCandidate[];
}

export interface ProcessorOutputIntegrityVerdict {
  ok: boolean;
  action: ProcessorOutputIntegrityAction;
  integrity_id: string | null;
  branch: string;
  head_sha: string;
  admitted_processor_ids: string[];
  admitted_signatures: string[];
  accepted_outputs: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const TIER_WEIGHT: Record<ProcessorOutputIntegrityTier, number> = {
  direct_current_instruction: 5,
  direct_archive: 4,
  archive_derived: 3,
  memory: 2,
  model_summary: 1,
};

function normalized(value: string): string {
  return value.trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(normalized).filter(Boolean))];
}

function outputKey(candidate: ProcessorOutputIntegrityCandidate): string {
  return `${normalized(candidate.processor_id)}::${normalized(candidate.load_id)}`;
}

function strongestTier(tiers: ProcessorOutputIntegrityTier[]): ProcessorOutputIntegrityTier | null {
  let selected: ProcessorOutputIntegrityTier | null = null;

  for (const tier of tiers) {
    if (!selected || TIER_WEIGHT[tier] > TIER_WEIGHT[selected]) selected = tier;
  }

  return selected;
}

function base(input: ProcessorOutputIntegrityInput): Pick<
  ProcessorOutputIntegrityVerdict,
  "integrity_id" | "branch" | "head_sha"
> {
  const integrityId = normalized(input.integrity_id);
  return {
    integrity_id: integrityId || null,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
  };
}

function block(
  input: ProcessorOutputIntegrityInput,
  action: Exclude<
    ProcessorOutputIntegrityAction,
    "admit_processor_output_integrity" | "settle_exact_processor_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ProcessorOutputIntegrityVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    admitted_processor_ids: [],
    admitted_signatures: [],
    accepted_outputs: [],
    decisive_evidence: unique(evidence),
    blockers: unique(blockers),
    next_route: nextRoute,
  };
}

export function admitProcessorOutputIntegrity(
  input: ProcessorOutputIntegrityInput,
): ProcessorOutputIntegrityVerdict {
  const integrityId = normalized(input.integrity_id);
  const candidates = input.candidates.filter((candidate) => normalized(candidate.processor_id) && normalized(candidate.load_id));
  const allEvidence = unique(candidates.flatMap((candidate) => candidate.evidence));

  if (!integrityId) {
    return block(input, "block_missing_integrity_id", ["processor output integrity batch has no id"], "mint an integrity id before convergence");
  }

  if (input.spent_integrity_ids.includes(integrityId)) {
    return block(input, "block_reused_integrity_id", [`processor output integrity batch already spent: ${integrityId}`], "create a fresh integrity batch for new processor outputs");
  }

  const wrongBranch = candidates.find((candidate) => candidate.branch !== input.active_branch);
  if (wrongBranch) {
    return block(
      input,
      "block_wrong_branch",
      [`processor ${wrongBranch.processor_id}/${wrongBranch.load_id} is on ${wrongBranch.branch}, not ${input.active_branch}`],
      "discard cross-branch processor outputs before convergence",
      wrongBranch.evidence,
    );
  }

  const wrongHead = candidates.find((candidate) => candidate.head_sha !== input.live_head_sha);
  if (wrongHead) {
    return block(
      input,
      "block_wrong_head",
      [`processor ${wrongHead.processor_id}/${wrongHead.load_id} belongs to ${wrongHead.head_sha}, not live head ${input.live_head_sha}`],
      "rerun processor outputs against the live PR head before convergence",
      wrongHead.evidence,
    );
  }

  const presentProcessors = new Set(candidates.map((candidate) => normalized(candidate.processor_id)));
  const missingProcessors = unique(input.required_processor_ids).filter((processorId) => !presentProcessors.has(processorId));
  if (missingProcessors.length > 0) {
    return block(
      input,
      "block_missing_required_processor",
      missingProcessors.map((processorId) => `missing required processor output: ${processorId}`),
      "collect every required processor output before convergence",
      allEvidence,
    );
  }

  const keys = candidates.map(outputKey);
  if (unique(keys).length !== keys.length) {
    return block(
      input,
      "block_duplicate_processor_output",
      ["processor output integrity batch contains duplicate processor/load outputs"],
      "settle each dispatched processor/load pair once",
      allEvidence,
    );
  }

  const missingOutput = candidates.find((candidate) => !normalized(candidate.output));
  if (missingOutput) {
    return block(
      input,
      "block_missing_output",
      [`processor ${missingOutput.processor_id}/${missingOutput.load_id} has no output`],
      "complete every processor output before convergence",
      missingOutput.evidence,
    );
  }

  const missingEvidence = candidates.find((candidate) => unique(candidate.evidence).length === 0);
  if (missingEvidence) {
    return block(
      input,
      "block_missing_evidence",
      [`processor ${missingEvidence.processor_id}/${missingEvidence.load_id} has no evidence`],
      "attach source, file, proof, or receipt evidence to every processor output",
    );
  }

  const weakSource = candidates.find((candidate) => {
    const tier = strongestTier(candidate.source_tiers);
    return !tier || TIER_WEIGHT[tier] < TIER_WEIGHT[input.minimum_source_tier];
  });
  if (weakSource) {
    return block(
      input,
      "block_weak_source_tier",
      [`processor ${weakSource.processor_id}/${weakSource.load_id} has no source tier at or above ${input.minimum_source_tier}`],
      "raise source authority before processor convergence",
      weakSource.evidence,
    );
  }

  const signatures = unique(candidates.map((candidate) => candidate.semantic_signature));
  if (signatures.length !== candidates.length) {
    return block(
      input,
      "block_recycled_signature",
      ["every processor output must carry a unique semantic signature"],
      "assign unique semantic signatures before convergence",
      allEvidence,
    );
  }

  const recycledSignature = signatures.find((signature) => input.spent_semantic_signatures.includes(signature));
  if (recycledSignature) {
    return block(
      input,
      "block_recycled_signature",
      [`processor output signature already spent: ${recycledSignature}`],
      "synthesize materially new processor output before convergence",
      allEvidence,
    );
  }

  const exactBlockers = unique([
    ...candidates.filter((candidate) => candidate.output_class === "exact_blocker").map((candidate) => candidate.output),
    ...candidates.flatMap((candidate) => candidate.blockers),
  ]);
  if (exactBlockers.length > 0) {
    return {
      ...base(input),
      ok: true,
      action: "settle_exact_processor_blocker",
      admitted_processor_ids: unique(candidates.map((candidate) => candidate.processor_id)),
      admitted_signatures: signatures,
      accepted_outputs: exactBlockers,
      decisive_evidence: allEvidence,
      blockers: exactBlockers,
      next_route: "release the exact processor blocker before forcing convergence",
    };
  }

  const unresolvedPressure = candidates.filter(
    (candidate) =>
      (candidate.output_class === "route_attack" || candidate.output_class === "omission_warning") &&
      !["clear", "no contradiction", "no omission"].includes(normalized(candidate.output).toLowerCase()),
  );
  if (unresolvedPressure.length > 0) {
    return block(
      input,
      "block_unresolved_processor_blocker",
      unresolvedPressure.map((candidate) => `${candidate.processor_id}/${candidate.load_id}: ${candidate.output}`),
      "resolve processor attacks and omission warnings before convergence",
      allEvidence,
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_processor_output_integrity",
    admitted_processor_ids: unique(candidates.map((candidate) => candidate.processor_id)),
    admitted_signatures: signatures,
    accepted_outputs: unique(candidates.map((candidate) => candidate.output)),
    decisive_evidence: allEvidence,
    blockers: [],
    next_route: "feed the integrity-admitted processor output batch into source-authorized convergence",
  };
}
