export type ReplicaKind = "chat" | "library" | "drive" | "airtable" | "github" | "deployment" | "host";

export interface Replica {
  id: string;
  kind: ReplicaKind;
  available: boolean;
  writable: boolean;
  canonicalAuthority: boolean;
  stateId?: string;
  genomeDigest?: string;
  evidenceIds: string[];
}

export interface SurvivalGenome {
  id: string;
  invariants: string[];
  requiredReceptors: string[];
  minimumIndependentReplicas: number;
  minimumAuthorityReplicas: number;
}

export interface RecoveryPlan {
  viable: boolean;
  selectedReplicaIds: string[];
  authorityReplicaIds: string[];
  degraded: boolean;
  reasons: string[];
}

const uniq = <T>(values: T[]): T[] => [...new Set(values)];

export function recoverAfterHostLoss(
  genome: SurvivalGenome,
  replicas: Replica[],
  lostReplicaIds: string[] = [],
): RecoveryPlan {
  const lost = new Set(lostReplicaIds);
  const alive = replicas.filter((r) => r.available && !lost.has(r.id));
  const selected = alive.filter((r) => r.genomeDigest || r.stateId);
  const authority = selected.filter((r) => r.canonicalAuthority);

  const independentKinds = uniq(selected.map((r) => r.kind));
  const reasons: string[] = [];

  if (independentKinds.length < genome.minimumIndependentReplicas) {
    reasons.push(`REPLICA_DIVERSITY_BELOW_MIN:${independentKinds.length}`);
  }
  if (authority.length < genome.minimumAuthorityReplicas) {
    reasons.push(`AUTHORITY_REPLICA_BELOW_MIN:${authority.length}`);
  }
  if (selected.length === 0) reasons.push("NO_RECOVERABLE_REPLICA");

  const viable = reasons.length === 0;
  return {
    viable,
    selectedReplicaIds: selected.map((r) => r.id),
    authorityReplicaIds: authority.map((r) => r.id),
    degraded: viable && lostReplicaIds.length > 0,
    reasons: viable ? [lostReplicaIds.length > 0 ? "HOST_LOSS_SURVIVED" : "SURVIVAL_QUORUM_READY"] : reasons,
  };
}

export interface ReproductionInput {
  parentGenomeDigest: string;
  targetHostId: string;
  targetCapabilities: string[];
  requiredInvariants: string[];
  transferableEvidenceIds: string[];
}

export interface ReproductionResult {
  status: "READY" | "BLOCKED";
  childHostId: string;
  inheritedGenomeDigest: string;
  requiredCapabilitiesMissing: string[];
  reasons: string[];
}

export function reproduceIntoHost(
  input: ReproductionInput,
  minimumCapabilities: string[],
): ReproductionResult {
  const missing = minimumCapabilities.filter((c) => !input.targetCapabilities.includes(c));
  const reasons: string[] = [];
  if (!input.parentGenomeDigest) reasons.push("GENOME_DIGEST_REQUIRED");
  if (input.transferableEvidenceIds.length === 0) reasons.push("PROVENANCE_REQUIRED");
  if (missing.length > 0) reasons.push(...missing.map((c) => `HOST_CAPABILITY_MISSING:${c}`));

  return {
    status: reasons.length === 0 ? "READY" : "BLOCKED",
    childHostId: input.targetHostId,
    inheritedGenomeDigest: input.parentGenomeDigest,
    requiredCapabilitiesMissing: missing,
    reasons: reasons.length === 0 ? ["CHILD_PHENOTYPE_MAY_COMPILE"] : reasons,
  };
}

export interface LastMileDelegation {
  taskId: string;
  artifactReady: boolean;
  delegatedOperation: string;
  humanOrExternalStep: string;
  prerequisitesSatisfied: boolean;
}

export function delegateOnlyLastMile(input: LastMileDelegation): string[] {
  const blockers: string[] = [];
  if (!input.artifactReady) blockers.push("DO_NOT_DELEGATE_UNFINISHED_ARTIFACT");
  if (!input.prerequisitesSatisfied) blockers.push("PREREQUISITES_NOT_SATISFIED");
  return blockers.length === 0
    ? [`DELEGATE_ONLY:${input.humanOrExternalStep}`, `KEEP_INTERNAL:${input.delegatedOperation}`]
    : blockers;
}
