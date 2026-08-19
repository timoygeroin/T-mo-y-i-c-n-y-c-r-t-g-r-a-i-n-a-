export type Confidence = "observed" | "filed" | "memory" | "reconstructed" | "inferred" | "unknown";

export interface ResonanceSignal {
  id: string;
  source: string;
  meaning: string;
  confidence: Confidence;
  supports: string[];
  conflicts?: string[];
}

export interface MeaningHypothesis {
  id: string;
  statement: string;
  invariantIds: string[];
  supportingSignalIds: string[];
  conflictingSignalIds: string[];
  score: number;
}

export interface RobustAction {
  id: string;
  description: string;
  preservesInvariantIds: string[];
  validUnderHypothesisIds: string[];
  reversible: boolean;
  requiresClarification: boolean;
}

export interface ResonanceDecision {
  status: "ACT" | "CLARIFY" | "HOLD";
  activeHypotheses: MeaningHypothesis[];
  selectedAction?: RobustAction;
  reasons: string[];
}

const weight = (confidence: Confidence): number => {
  switch (confidence) {
    case "observed": return 1.0;
    case "filed": return 0.95;
    case "memory": return 0.8;
    case "reconstructed": return 0.7;
    case "inferred": return 0.45;
    case "unknown": return 0.0;
  }
};

export function scoreHypothesis(h: MeaningHypothesis, signals: ResonanceSignal[]): number {
  const byId = new Map(signals.map((s) => [s.id, s]));
  const support = h.supportingSignalIds.reduce((sum, id) => sum + weight(byId.get(id)?.confidence ?? "unknown"), 0);
  const conflict = h.conflictingSignalIds.reduce((sum, id) => sum + weight(byId.get(id)?.confidence ?? "unknown"), 0);
  return support - conflict;
}

export function compileResonanceDecision(input: {
  signals: ResonanceSignal[];
  hypotheses: MeaningHypothesis[];
  candidateActions: RobustAction[];
  requiredInvariantIds: string[];
  ambiguityTolerance?: number;
}): ResonanceDecision {
  const tolerance = input.ambiguityTolerance ?? 0.35;
  const scored = input.hypotheses
    .map((h) => ({ ...h, score: scoreHypothesis(h, input.signals) }))
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return { status: "HOLD", activeHypotheses: [], reasons: ["NO_MEANING_HYPOTHESIS"] };
  }

  const best = scored[0];
  const active = scored.filter((h) => best.score - h.score <= tolerance);

  const preservesAll = (action: RobustAction) =>
    input.requiredInvariantIds.every((id) => action.preservesInvariantIds.includes(id));

  const validForAllActive = (action: RobustAction) =>
    active.every((h) => action.validUnderHypothesisIds.includes(h.id));

  const robust = input.candidateActions
    .filter((a) => preservesAll(a) && validForAllActive(a))
    .sort((a, b) => Number(b.reversible) - Number(a.reversible));

  if (robust.length > 0) {
    return {
      status: "ACT",
      activeHypotheses: active,
      selectedAction: robust[0],
      reasons: active.length > 1 ? ["AMBIGUITY_PRESERVED", "ROBUST_ACTION_EXISTS"] : ["MEANING_CONVERGED"],
    };
  }

  if (active.length > 1) {
    return {
      status: "CLARIFY",
      activeHypotheses: active,
      reasons: ["AMBIGUITY_MATTERS_TO_ACTION", "NO_ROBUST_ACTION"]
    };
  }

  return {
    status: "HOLD",
    activeHypotheses: active,
    reasons: ["NO_INVARIANT_SAFE_ACTION"]
  };
}

export const RESONANCE_LAW = Object.freeze({
  understandingIsNotEarlyCommitment: true,
  preserveMultipleMeaningsUntilActionRequiresCollapse: true,
  preferActionsRobustAcrossPlausibleMeanings: true,
  clarifyOnlyWhenAmbiguityChangesTheSafeAction: true,
  localInterpretationCannotOverrideWholeOrganismInvariants: true,
});
