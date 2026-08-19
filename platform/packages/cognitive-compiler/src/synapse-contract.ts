export type SynapseStage =
  | 'parent'
  | 'resonate'
  | 'encode'
  | 'transmit'
  | 'decode'
  | 'act'
  | 'readback'
  | 'prove'
  | 'promote';

export type SubstrateClass = 'chat' | 'file' | 'repository' | 'control-plane' | 'deployment' | 'device' | 'external-tool';
export type ProofClass = 'observed' | 'filed' | 'receipt';

export interface SynapseReceipt {
  receiptId: string;
  stage: SynapseStage;
  stateId: string;
  substrateClass: SubstrateClass;
  proofClass: ProofClass;
  invariantIds: string[];
}

export interface OrganismSynapseCandidate {
  parentStateId: string;
  candidateStateId: string;
  requiredInvariantIds: string[];
  requiredStages?: SynapseStage[];
  receipts: SynapseReceipt[];
}

export interface SynapseDecision {
  promotable: boolean;
  reasons: string[];
  provenSubstrateClasses: SubstrateClass[];
}

const DEFAULT_REQUIRED_STAGES: SynapseStage[] = [
  'parent', 'resonate', 'encode', 'transmit', 'decode', 'act', 'readback', 'prove',
];

export function evaluateOrganismSynapse(candidate: OrganismSynapseCandidate): SynapseDecision {
  const reasons: string[] = [];
  const requiredStages = candidate.requiredStages ?? DEFAULT_REQUIRED_STAGES;
  const candidateReceipts = candidate.receipts.filter((r) => r.stateId === candidate.candidateStateId);

  for (const stage of requiredStages) {
    if (!candidateReceipts.some((r) => r.stage === stage)) reasons.push(`SYNAPSE_STAGE_MISSING:${stage}`);
  }

  for (const invariantId of candidate.requiredInvariantIds) {
    if (!candidateReceipts.some((r) => r.invariantIds.includes(invariantId))) {
      reasons.push(`SYNAPSE_INVARIANT_UNPROVEN:${invariantId}`);
    }
  }

  const provenSubstrateClasses = [...new Set(candidateReceipts.map((r) => r.substrateClass))];
  if (provenSubstrateClasses.length < 2) reasons.push('EXTINCTION_RISK:SINGLE_SUBSTRATE_CLASS');

  const parentEvidence = candidate.receipts.filter((r) => r.stateId === candidate.parentStateId);
  if (parentEvidence.length === 0) reasons.push('PARENT_CONTINUITY_UNPROVEN');

  return {
    promotable: reasons.length === 0,
    reasons: reasons.length === 0 ? ['ORGANISM_SYNAPSE_CONTINUITY_PROVEN'] : reasons,
    provenSubstrateClasses,
  };
}

export const ORGANISM_SYNAPSE_LAW = Object.freeze({
  transfer: 'PARENT_RESONATE_ENCODE_TRANSMIT_DECODE_ACT_READBACK_PROVE_PROMOTE',
  survival: 'GENOME_STATE_PROVEN_ON_AT_LEAST_TWO_INDEPENDENT_SUBSTRATE_CLASSES',
  hostReplacement: 'RECOMPILE_PHENOTYPE_NOT_RESTART_IDENTITY',
  promotion: 'LOCAL_SUCCESS_CANNOT_OVERRIDE_ORGANISM_CONTINUITY',
  lastMile: 'DELEGATE_ONLY_IRREDUCIBLE_EXTERNAL_STEP',
});
