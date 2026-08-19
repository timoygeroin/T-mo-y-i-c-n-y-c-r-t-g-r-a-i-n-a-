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

export interface CompileInput {
  objective: string;
  requiredCapabilities: string[];
  invariants: string[];
  stateFingerprint: string;
  organs: Organ[];
  evidence: Evidence[];
  failedMoves?: FailedMove[];
  visualState?: VisualContinuityState;
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

const uniq = <T>(values: T[]): T[] => [...new Set(values)];

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

export function compileRuntime(input: CompileInput): CompileResult {
  const required = uniq(input.requiredCapabilities);
  const selected = new Map<string, Organ>();
  const dispatches: Dispatch[] = [];
  const missing: string[] = [];
  const reasons: string[] = [];

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

  const hasGrounding = input.evidence.some((item) =>
    item.class === "observed" || item.class === "filed" || item.class === "receipt",
  );

  if (!hasGrounding) reasons.push("NO_GROUNDED_EVIDENCE");

  const visualBlocked = reasons.some((reason) => reason.startsWith("VISUAL_"));

  return {
    status: missing.length === 0 && !visualBlocked ? "READY" : "BLOCKED",
    objective: input.objective,
    invariants: uniq(input.invariants),
    selectedOrgans: [...selected.keys()],
    dispatches: visualBlocked ? dispatches.filter((d) => d.capability !== "render-scene" && d.capability !== "edit-visual-scene") : dispatches,
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
      .filter((item) => item.class !== "inferred" && item.class !== "unknown")
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
