import {
  BlastRadius,
  CompiledPhenotype,
  ExpressionContext,
  MANDATORY_LIFECYCLE,
  ReleaseDecision,
} from "./contracts";

const radiusRank: Record<BlastRadius, number> = {
  TURN: 0,
  CHAT: 1,
  PROJECT: 2,
  ACCOUNT: 3,
  EXTERNAL_WORLD: 4,
};

export function compilePhenotype(context: ExpressionContext): CompiledPhenotype {
  const authorizedEffectors = context.capabilities
    .filter((capability) => capability.state === "AVAILABLE_AUTHORIZED")
    .map((capability) => capability.id);

  const organs = ["FOCUS", "PROVENANCE", "VERIFIER", "MUTATION"];
  if (authorizedEffectors.length > 1) organs.splice(1, 0, "RESONANCE");

  return {
    hostId: context.hostId,
    organs,
    processors: ["route-governor", "guards", "proof-evaluation"],
    effectors: authorizedEffectors,
    sourceTiers: context.provenance.length ? ["EVIDENCE_BACKED"] : ["UNRESOLVED"],
    proofCriteria: [
      ...context.invariants.map((invariant) => `preserve:${invariant}`),
      "authorized-effector",
      "blast-radius-within-authority",
      "temporal-gates-satisfied-before-dependent-actuation",
      "readback-before-strong-completion-claim",
    ],
    stopConditions: [
      "unknown-required-capability",
      "unsatisfied-dependent-temporal-gate",
      "blast-radius-exceeds-authority",
      "unresolved-strong-blocker",
    ],
    lifecycle: [...MANDATORY_LIFECYCLE],
  };
}

export function decideRightToRelease(
  context: ExpressionContext,
  phenotype: CompiledPhenotype,
): ReleaseDecision {
  const blockedEffectors = new Set<string>();

  for (const gate of context.temporalGates) {
    if (!gate.satisfied) {
      for (const effector of gate.dependentEffectors) blockedEffectors.add(effector);
    }
  }

  const unknownRequiredCapability = context.capabilities.some(
    (capability) =>
      phenotype.effectors.includes(capability.id) && capability.state === "UNKNOWN",
  );

  if (radiusRank[context.requestedBlastRadius] > radiusRank[context.authorizedBlastRadius]) {
    return {
      allowed: false,
      reason: "blast-radius-exceeds-authority",
      blockedEffectors: [...new Set([...phenotype.effectors, ...blockedEffectors])],
    };
  }

  if (unknownRequiredCapability) {
    return {
      allowed: false,
      reason: "unknown-required-capability",
      blockedEffectors: [...new Set([...phenotype.effectors, ...blockedEffectors])],
    };
  }

  if (blockedEffectors.size > 0) {
    return {
      allowed: false,
      reason: "unsatisfied-dependent-temporal-gate",
      blockedEffectors: [...blockedEffectors],
    };
  }

  if (context.unresolvedBlockers.length > 0) {
    return {
      allowed: false,
      reason: `unresolved-blocker:${context.unresolvedBlockers[0]}`,
      blockedEffectors: [...phenotype.effectors],
    };
  }

  return { allowed: true, reason: "release-gates-satisfied", blockedEffectors: [] };
}
