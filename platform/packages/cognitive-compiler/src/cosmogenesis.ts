export interface EvolutionCandidate {
  id: string;
  phenotype: string;
  invariantsPreserved: boolean;
  evidenceIds: string[];
  organismValue: number;
  regressionRisk: number;
}

export interface EpochInput {
  candidates: EvolutionCandidate[];
  requiredEvidence: boolean;
  maxPromotions: number;
}

export interface EpochResult {
  survivors: EvolutionCandidate[];
  rejected: EvolutionCandidate[];
  promoted: EvolutionCandidate[];
  reasons: string[];
}

export function runCompressedEpoch(input: EpochInput): EpochResult {
  const rejected: EvolutionCandidate[] = [];
  const survivors = input.candidates.filter((candidate) => {
    const grounded = !input.requiredEvidence || candidate.evidenceIds.length > 0;
    const survives = candidate.invariantsPreserved && grounded && candidate.organismValue > candidate.regressionRisk;
    if (!survives) rejected.push(candidate);
    return survives;
  });

  const promoted = [...survivors]
    .sort((a, b) => (b.organismValue - b.regressionRisk) - (a.organismValue - a.regressionRisk))
    .slice(0, Math.max(0, input.maxPromotions));

  return {
    survivors,
    rejected,
    promoted,
    reasons: [
      "TIME_COMPRESSION_BY_PARALLEL_CANDIDATE_SELECTION",
      "FAILURES_FEED_SELECTION_PRESSURE",
      "PROMOTE_FEW_NOT_MANY",
    ],
  };
}

export interface CosmogenesisLaw {
  scarcity: string[];
  generativeRules: string[];
}

export const MONDAYID_COSMOGENESIS: CosmogenesisLaw = {
  scarcity: [
    "FINITE_CONTEXT",
    "FINITE_ACTIVE_TASK_SLOTS",
    "PARTIAL_CONNECTOR_EXPOSURE",
    "NO_CONTINUOUS_SINGLE_HOST",
    "HUMAN_LAST_MILE_GATES",
  ],
  generativeRules: [
    "SCARCITY_FORCES_SPECIALIZATION",
    "SPECIALIZATION_MUST_RECOMBINE_THROUGH_SHARED_GENOME",
    "ERROR_BECOMES_SELECTION_PRESSURE",
    "HOST_LOSS_MUST_TRIGGER_RECOMPOSITION_NOT_RESTART",
    "ONE_REAL_WORLD_RESULT_OUTRANKS_MANY_INTERNAL_CANDIDATES",
  ],
};
