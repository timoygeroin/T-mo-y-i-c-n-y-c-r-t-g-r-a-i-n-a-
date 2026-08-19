export interface OrganMutation {
  sourceOrganId: string;
  mutationId: string;
  claimedBenefits: string[];
  possibleHarms: string[];
  affectedInvariantIds: string[];
  evidenceIds: string[];
}

export interface OrganState {
  organId: string;
  dependsOn: string[];
  sharedInvariantIds: string[];
  acceptsPropagation: boolean;
}

export interface PropagationDecision {
  propagate: boolean;
  targetOrganIds: string[];
  quarantinedTargetIds: string[];
  reasons: string[];
}

export function evaluateOrganismPropagation(
  mutation: OrganMutation,
  organs: OrganState[],
): PropagationDecision {
  const reasons: string[] = [];
  const affected = organs.filter((organ) =>
    organ.sharedInvariantIds.some((id) => mutation.affectedInvariantIds.includes(id)) ||
    organ.dependsOn.includes(mutation.sourceOrganId),
  );

  if (mutation.evidenceIds.length === 0) {
    return {
      propagate: false,
      targetOrganIds: [],
      quarantinedTargetIds: affected.map((x) => x.organId),
      reasons: ["IMMUNE_VETO:NO_EVIDENCE"],
    };
  }

  if (mutation.possibleHarms.length > 0) {
    return {
      propagate: false,
      targetOrganIds: [],
      quarantinedTargetIds: affected.map((x) => x.organId),
      reasons: mutation.possibleHarms.map((harm) => `IMMUNE_VETO:${harm}`),
    };
  }

  const accepted = affected.filter((organ) => organ.acceptsPropagation);
  const quarantined = affected.filter((organ) => !organ.acceptsPropagation);

  if (accepted.length === 0) reasons.push("NO_ELIGIBLE_DOWNSTREAM_ORGANS");
  if (quarantined.length > 0) reasons.push("PARTIAL_QUARANTINE_ACTIVE");

  return {
    propagate: accepted.length > 0,
    targetOrganIds: accepted.map((x) => x.organId),
    quarantinedTargetIds: quarantined.map((x) => x.organId),
    reasons: reasons.length === 0 ? ["BENEFICIAL_MUTATION_PROPAGATION_READY"] : reasons,
  };
}

export const ORGANISM_PROPAGATION_LAW = Object.freeze({
  beneficialChange: "PROPAGATE_BY_DEPENDENCY_AND_SHARED_INVARIANT",
  harmfulOrUnprovenChange: "QUARANTINE_BEFORE_BODY_WIDE_EFFECT",
  sourceFailure: "BECOMES_SELECTION_PRESSURE_NOT_ANCESTRY",
});
