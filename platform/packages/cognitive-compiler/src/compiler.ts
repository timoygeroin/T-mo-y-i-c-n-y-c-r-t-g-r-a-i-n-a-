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

export interface CompileInput {
  objective: string;
  requiredCapabilities: string[];
  invariants: string[];
  stateFingerprint: string;
  organs: Organ[];
  evidence: Evidence[];
  failedMoves?: FailedMove[];
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

export function compileRuntime(input: CompileInput): CompileResult {
  const required = uniq(input.requiredCapabilities);
  const selected = new Map<string, Organ>();
  const dispatches: Dispatch[] = [];
  const missing: string[] = [];
  const reasons: string[] = [];

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

  return {
    status: missing.length === 0 ? "READY" : "BLOCKED",
    objective: input.objective,
    invariants: uniq(input.invariants),
    selectedOrgans: [...selected.keys()],
    dispatches,
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
