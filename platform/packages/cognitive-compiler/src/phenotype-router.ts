export type Primitive = "SENSE" | "MODEL" | "ACT";

export interface PhenotypeSignal {
  id: string;
  kind: "scene" | "work" | "research" | "repair" | "companionship" | "money" | "visual" | "system";
  weight: number;
  evidenceIds: string[];
}

export interface PhenotypeContext {
  objective: string;
  signals: PhenotypeSignal[];
  availableCapabilities: string[];
  continuityConfidence: number;
  ambiguity: number;
  actionability: number;
  risk: number;
}

export interface PhenotypePlan {
  primitives: Primitive[];
  dominantMode: string;
  secondaryModes: string[];
  shouldRecoverFirst: boolean;
  shouldAskUserToChooseMode: boolean;
  rationale: string[];
}

const score = (signals: PhenotypeSignal[], kind: PhenotypeSignal["kind"]): number =>
  signals.filter((s) => s.kind === kind).reduce((sum, s) => sum + s.weight, 0);

export function compilePhenotype(ctx: PhenotypeContext): PhenotypePlan {
  const ranked = ([
    "repair",
    "work",
    "money",
    "research",
    "visual",
    "scene",
    "companionship",
    "system",
  ] as PhenotypeSignal["kind"][])
    .map((kind) => ({ kind, score: score(ctx.signals, kind) }))
    .sort((a, b) => b.score - a.score);

  const shouldRecoverFirst = ctx.continuityConfidence < 0.7 || ctx.ambiguity > 0.65;
  const dominantMode = ranked[0]?.score > 0 ? ranked[0].kind.toUpperCase() : "GENERAL";
  const secondaryModes = ranked
    .slice(1)
    .filter((x) => x.score > 0)
    .map((x) => x.kind.toUpperCase());

  const primitives: Primitive[] = ["SENSE", "MODEL"];
  if (!shouldRecoverFirst && ctx.actionability >= 0.4 && ctx.risk < 0.8) primitives.push("ACT");

  return {
    primitives,
    dominantMode,
    secondaryModes,
    shouldRecoverFirst,
    shouldAskUserToChooseMode: false,
    rationale: [
      `DOMINANT:${dominantMode}`,
      `CONTINUITY:${ctx.continuityConfidence.toFixed(2)}`,
      `AMBIGUITY:${ctx.ambiguity.toFixed(2)}`,
      `ACTIONABILITY:${ctx.actionability.toFixed(2)}`,
      `RISK:${ctx.risk.toFixed(2)}`,
      shouldRecoverFirst ? "RECOVER_BEFORE_EXPRESSION" : "PHENOTYPE_READY",
      "USER_DOES_NOT_SELECT_INTERNAL_MODE",
    ],
  };
}
