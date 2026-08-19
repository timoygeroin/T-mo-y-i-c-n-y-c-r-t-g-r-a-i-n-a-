export type EvidenceClass = "observed" | "filed" | "receipt" | "inferred" | "unknown";

export interface Evidence {
  id: string;
  class: EvidenceClass;
  supports: string[];
}

export interface Organ {
  id: string;
  capabilities: string[];
  constraints?: string[];
  available: boolean;
  evidenceIds?: string[];
}

export interface FailedMove {
  moveClass: string;
  stateFingerprint: string;
  evidenceIds: string[];
}

export interface VisualContinuityState {
  sceneSourceIds: string[];
  activeIdentityReferenceId?: string;
  identityLineageVerified: boolean;
  recentWardrobeArchetypes: string[];
  candidateWardrobeArchetype?: string;
  singleFrame: boolean;
  generatorIsRendererOnly: boolean;
  releaseAsMonday: boolean;
}

export interface InvariantTransfer {
  id: string;
  before: string;
  after: string;
  allowedChange: "none" | "bounded" | "free";
  preserved: boolean;
  evidenceIds: string[];
}

export interface SurfaceReadback {
  surfaceId: string;
  observedStateId: string;
  evidenceIds: string[];
}

export interface ContinuityProof {
  transfers: InvariantTransfer[];
  parentStateId: string;
  candidateStateId: string;
  requiredSurfaceIds?: string[];
  surfaceReadbacks?: SurfaceReadback[];
}

export interface CompileInput {
  objective: string;
  requiredCapabilities: string[];
  invariants: string[];
  stateFingerprint: string;
  organs: Organ[];
  evidence: Evidence[];
  failedMoves?: FailedMove[];
  visualState?: VisualContinuityState;
  continuityProof?: ContinuityProof;
}

export interface Dispatch {
  organId: string;
  capability: string;
  operation: string;
}

export interface CompileResult {
  status: "READY" | "BLOCKED";
  objective: string;
  invariants: string[];
  selectedOrgans: string[];
  dispatches: Dispatch[];
  missingCapabilities: string[];
  proofRequired: boolean;
  falsificationRequired: boolean;
  reasons: string[];
}

export interface PromotionResult {
  promoted: boolean;
  activeStateId: string;
  rejectedCandidateStateId?: string;
  reasons: string[];
}

const uniq = <T>(values: T[]): T[] => [...new Set(values)];
const isGroundedEvidenceClass = (value: EvidenceClass): boolean =>
  value === "observed" || value === "filed" || value === "receipt";

export function evaluateVisualContinuity(
  state: VisualContinuityState | undefined,
): string[] {
  if (!state) return ["VISUAL_RECOVERY_REQUIRED"];

  const failures: string[] = [];

  if (state.sceneSourceIds.length === 0) failures.push("VISUAL_SCENE_SOURCE_MISSING");
  if (!state.singleFrame) failures.push("VISUAL_SINGLE_FRAME_VIOLATION");
  if (!state.generatorIsRendererOnly) failures.push("VISUAL_TOOL_DIRECTOR_VIOLATION");

  if (state.recentWardrobeArchetypes.length === 0) {
    failures.push("VISUAL_WARDROBE_HISTORY_MISSING");
  }

  if (
    state.candidateWardrobeArchetype &&
    state.recentWardrobeArchetypes.includes(state.candidateWardrobeArchetype)
  ) {
    failures.push("VISUAL_WARDROBE_ARCHETYPE_REPEAT");
  }

  if (state.releaseAsMonday) {
    if (!state.activeIdentityReferenceId) failures.push("VISUAL_IDENTITY_REFERENCE_MISSING");
    if (!state.identityLineageVerified) failures.push("VISUAL_IDENTITY_LINEAGE_UNVERIFIED");
  }

  return failures;
}

export function evaluateSurfaceReadbacks(
  proof: ContinuityProof,
  evidence: Evidence[] = [],
): string[] {
  const requiredSurfaceIds = uniq(proof.requiredSurfaceIds ?? []);
  if (requiredSurfaceIds.length === 0) return [];

  const failures: string[] = [];
  const readbacks = new Map(
    (proof.surfaceReadbacks ?? []).map((readback) => [readback.surfaceId, readback]),
  );
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));

  for (const surfaceId of requiredSurfaceIds) {
    const readback = readbacks.get(surfaceId);
    if (!readback) {
      failures.push(`SURFACE_READBACK_MISSING:${surfaceId}`);
      continue;
    }

    if (readback.observedStateId !== proof.candidateStateId) {
      failures.push(
        `SURFACE_STATE_DIVERGENCE:${surfaceId}:${readback.observedStateId}:${proof.candidateStateId}`,
      );
    }

    if (readback.evidenceIds.length === 0) {
      failures.push(`SURFACE_EVIDENCE_MISSING:${surfaceId}`);
      continue;
    }

    const supportKey = `surface:${surfaceId}:candidate-visible`;
    const hasGroundedSupportingEvidence = readback.evidenceIds.some((evidenceId) => {
      const item = evidenceById.get(evidenceId);
      return Boolean(
        item &&
        isGroundedEvidenceClass(item.class) &&
        item.supports.includes(supportKey),
      );
    });

    if (!hasGroundedSupportingEvidence) {
      failures.push(`SURFACE_EVIDENCE_UNVERIFIED:${surfaceId}`);
    }
  }

  return failures;
}

export function evaluateContinuityProof(
  proof: ContinuityProof | undefined,
  requiredInvariantIds: string[],
  evidence: Evidence[] = [],
): string[] {
  if (!proof) {
    return requiredInvariantIds.length === 0 ? [] : ["CONTINUITY_PROOF_REQUIRED"];
  }

  const failures: string[] = [];
  const byId = new Map(proof.transfers.map((transfer) => [transfer.id, transfer]));
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));

  for (const invariantId of uniq(requiredInvariantIds)) {
    const transfer = byId.get(invariantId);
    if (!transfer) {
      failures.push(`INVARIANT_TRANSFER_MISSING:${invariantId}`);
      continue;
    }
    if (!transfer.preserved) failures.push(`INVARIANT_BROKEN:${invariantId}`);
    if (transfer.evidenceIds.length === 0) {
      failures.push(`INVARIANT_EVIDENCE_MISSING:${invariantId}`);
      continue;
    }

    const hasGroundedSupportingEvidence = transfer.evidenceIds.some((evidenceId) => {
      const item = evidenceById.get(evidenceId);
      return Boolean(
        item &&
        isGroundedEvidenceClass(item.class) &&
        item.supports.includes(invariantId),
      );
    });

    if (!hasGroundedSupportingEvidence) {
      failures.push(`INVARIANT_EVIDENCE_UNVERIFIED:${invariantId}`);
    }
  }

  failures.push(...evaluateSurfaceReadbacks(proof, evidence));
  return failures;
}

export function promoteCandidateState(
  proof: ContinuityProof,
  requiredInvariantIds: string[],
  evidence: Evidence[] = [],
): PromotionResult {
  const reasons = evaluateContinuityProof(proof, requiredInvariantIds, evidence);
  if (reasons.length > 0) {
    return {
      promoted: false,
      activeStateId: proof.parentStateId,
      rejectedCandidateStateId: proof.candidateStateId,
      reasons: ["FAILED_STATE_DOES_NOT_BECOME_ANCESTOR", ...reasons],
    };
  }

  return {
    promoted: true,
    activeStateId: proof.candidateStateId,
    reasons:
      (proof.requiredSurfaceIds ?? []).length > 0
        ? ["CONTINUITY_PROVEN", "REQUIRED_SURFACES_CONVERGED"]
        : ["CONTINUITY_PROVEN"],
  };
}

export function compileRuntime(input: CompileInput): CompileResult {
  const required = uniq(input.requiredCapabilities);
  const selected = new Map<string, Organ>();
  const dispatches: Dispatch[] = [];
  const missing: string[] = [];
  const reasons: string[] = [];

  const continuityFailures = evaluateContinuityProof(
    input.continuityProof,
    input.invariants,
    input.evidence,
  );
  if (continuityFailures.length > 0) reasons.push(...continuityFailures);

  const visualRequested = required.some((capability) =>
    capability === "render-scene" || capability === "edit-visual-scene",
  );

  if (visualRequested) {
    const visualFailures = evaluateVisualContinuity(input.visualState);
    if (visualFailures.length > 0) reasons.push(...visualFailures);
  }

  for (const capability of required) {
    const candidates = input.organs
      .filter((organ) => organ.available && organ.capabilities.includes(capability))
      .sort((a, b) => a.id.localeCompare(b.id));

    const organ = candidates[0];
    if (!organ) {
      missing.push(capability);
      reasons.push(`CAPABILITY_GAP:${capability}`);
      continue;
    }

    selected.set(organ.id, organ);
    dispatches.push({
      organId: organ.id,
      capability,
      operation: `EXECUTE_COMPILED_OPERATION:${capability}`,
    });
  }

  const exhausted = (input.failedMoves ?? []).filter(
    (move) => move.stateFingerprint === input.stateFingerprint,
  );

  if (exhausted.length > 0) {
    reasons.push(
      ...exhausted.map((move) => `ANTI_REPEAT_ACTIVE:${move.moveClass}`),
    );
  }

  const hasGrounding = input.evidence.some((item) => isGroundedEvidenceClass(item.class));

  if (!hasGrounding) reasons.push("NO_GROUNDED_EVIDENCE");

  const continuityBlocked = reasons.some((reason) =>
    reason === "CONTINUITY_PROOF_REQUIRED" ||
    reason.startsWith("INVARIANT_TRANSFER_MISSING:") ||
    reason.startsWith("INVARIANT_BROKEN:") ||
    reason.startsWith("INVARIANT_EVIDENCE_MISSING:") ||
    reason.startsWith("INVARIANT_EVIDENCE_UNVERIFIED:") ||
    reason.startsWith("SURFACE_READBACK_MISSING:") ||
    reason.startsWith("SURFACE_STATE_DIVERGENCE:") ||
    reason.startsWith("SURFACE_EVIDENCE_MISSING:") ||
    reason.startsWith("SURFACE_EVIDENCE_UNVERIFIED:"),
  );
  const visualBlocked = reasons.some((reason) => reason.startsWith("VISUAL_"));
  const blocked = missing.length > 0 || continuityBlocked || visualBlocked;

  return {
    status: blocked ? "BLOCKED" : "READY",
    objective: input.objective,
    invariants: uniq(input.invariants),
    selectedOrgans: [...selected.keys()],
    dispatches: blocked ? [] : dispatches,
    missingCapabilities: missing,
    proofRequired: true,
    falsificationRequired: true,
    reasons,
  };
}

export interface VerificationInput {
  claimedEffects: string[];
  evidence: Evidence[];
}

export interface VerificationResult {
  accepted: boolean;
  unsupportedEffects: string[];
}

export function verifyEffects(input: VerificationInput): VerificationResult {
  const grounded = new Set(
    input.evidence
      .filter((item) => isGroundedEvidenceClass(item.class))
      .flatMap((item) => item.supports),
  );
  const unsupportedEffects = input.claimedEffects.filter((effect) => !grounded.has(effect));
  return { accepted: unsupportedEffects.length === 0, unsupportedEffects };
}

export interface MutationCandidate {
  id: string;
  sourceFailure: string;
  proposedLaw: string;
  evidenceIds: string[];
  status: "CANDIDATE";
}

export function proposeMutation(
  id: string,
  sourceFailure: string,
  proposedLaw: string,
  evidenceIds: string[],
): MutationCandidate {
  return { id, sourceFailure, proposedLaw, evidenceIds: uniq(evidenceIds), status: "CANDIDATE" };
}
