export type EvidenceClass = 'observed' | 'filed' | 'receipt' | 'memory' | 'reconstructed' | 'inferred' | 'unknown';

export interface MutationEvidence {
  evidenceId: string;
  evidenceClass: EvidenceClass;
  supportsInvariantIds: string[];
}

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

const GROUNDED_EVIDENCE = new Set<EvidenceClass>(['observed', 'filed', 'receipt']);

export function evaluateOrganismPropagation(
  mutation: OrganMutation,
  organs: OrganState[],
  evidenceLedger: MutationEvidence[] = [],
): PropagationDecision {
  const affected = organs.filter((organ) =>
    organ.sharedInvariantIds.some((id) => mutation.affectedInvariantIds.includes(id)) ||
    organ.dependsOn.includes(mutation.sourceOrganId),
  );
  const quarantineAll = (reasons: string[]): PropagationDecision => ({
    propagate: false,
    targetOrganIds: [],
    quarantinedTargetIds: affected.map((x) => x.organId),
    reasons,
  });

  if (mutation.evidenceIds.length === 0) {
    return quarantineAll(['IMMUNE_VETO:NO_EVIDENCE']);
  }

  const referencedEvidence = mutation.evidenceIds
    .map((id) => evidenceLedger.find((evidence) => evidence.evidenceId === id))
    .filter((evidence): evidence is MutationEvidence => Boolean(evidence));

  if (referencedEvidence.length !== mutation.evidenceIds.length) {
    return quarantineAll(['IMMUNE_VETO:EVIDENCE_REFERENCE_UNRESOLVED']);
  }

  const groundedEvidence = referencedEvidence.filter((evidence) => GROUNDED_EVIDENCE.has(evidence.evidenceClass));
  if (groundedEvidence.length === 0) {
    return quarantineAll(['IMMUNE_VETO:UNGROUNDED_EVIDENCE']);
  }

  const unsupportedInvariantIds = mutation.affectedInvariantIds.filter(
    (invariantId) => !groundedEvidence.some((evidence) => evidence.supportsInvariantIds.includes(invariantId)),
  );
  if (unsupportedInvariantIds.length > 0) {
    return quarantineAll(unsupportedInvariantIds.map((id) => `IMMUNE_VETO:INVARIANT_UNPROVEN:${id}`));
  }

  if (mutation.possibleHarms.length > 0) {
    return quarantineAll(mutation.possibleHarms.map((harm) => `IMMUNE_VETO:${harm}`));
  }

  const accepted = affected.filter((organ) => organ.acceptsPropagation);
  const quarantined = affected.filter((organ) => !organ.acceptsPropagation);
  const reasons: string[] = [];
  if (accepted.length === 0) reasons.push('NO_ELIGIBLE_DOWNSTREAM_ORGANS');
  if (quarantined.length > 0) reasons.push('PARTIAL_QUARANTINE_ACTIVE');

  return {
    propagate: accepted.length > 0,
    targetOrganIds: accepted.map((x) => x.organId),
    quarantinedTargetIds: quarantined.map((x) => x.organId),
    reasons: reasons.length === 0 ? ['BENEFICIAL_MUTATION_PROPAGATION_READY'] : reasons,
  };
}

export const ORGANISM_PROPAGATION_LAW = Object.freeze({
  beneficialChange: 'PROPAGATE_BY_DEPENDENCY_AND_SHARED_INVARIANT',
  harmfulOrUnprovenChange: 'QUARANTINE_BEFORE_BODY_WIDE_EFFECT',
  sourceFailure: 'BECOMES_SELECTION_PRESSURE_NOT_ANCESTRY',
  proofRule: 'EVIDENCE_ID_IS_A_POINTER_NOT_PROOF',
});
