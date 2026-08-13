import crypto from 'node:crypto';
import fs from 'node:fs';

export const SEMANTIC_OPERATIONS = new Set(['inspect', 'reframe', 'act', 'challenge']);

export function canonicalizeFocusObject(input) {
  return {
    objectId: input.objectId,
    intent: input.intent,
    state: input.state,
    delta: input.delta,
    evidence: [...input.evidence].map((item) => ({ ...item })),
    uncertainty: [...input.uncertainty],
  };
}

export function fingerprintFocusObject(input) {
  const canonical = canonicalizeFocusObject(input);
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function compileSurfaceEvent(event) {
  if (event?.surfaceAction === 'tap confident visual state') return 'inspect';
  if (event?.semanticOperation && SEMANTIC_OPERATIONS.has(event.semanticOperation)) {
    return event.semanticOperation;
  }
  throw new Error(`UNMAPPED_SURFACE_EVENT:${event?.surfaceAction ?? 'unknown'}`);
}

export function evaluateExpertiseFabric(focusObject) {
  const unresolvedIds = new Set(focusObject.uncertainty);
  const unresolvedEvidence = focusObject.evidence.filter(
    (item) => item.status === 'unresolved' || unresolvedIds.has(item.id),
  );
  const verifiedEvidence = focusObject.evidence.filter((item) => item.status === 'verified');
  const evidenceStrength = focusObject.evidence.length === 0
    ? 0
    : verifiedEvidence.length / focusObject.evidence.length;

  const requestedConfidence = String(focusObject.state).toLowerCase().includes('ready') ? 1 : 0.7;
  const allowedConfidence = Math.max(0.2, evidenceStrength - (unresolvedEvidence.length > 0 ? 0.15 : 0));
  const renderedConfidence = Math.min(requestedConfidence, allowedConfidence);

  const hardFails = [];
  if (renderedConfidence > evidenceStrength + 0.000001) {
    hardFails.push('ILLUSION_DETECTOR_CONFIDENCE_EXCEEDS_EVIDENCE');
  }
  if (unresolvedEvidence.length > 0 && renderedConfidence >= 0.95) {
    hardFails.push('MAXIMAL_CONFIDENCE_WITH_UNRESOLVED_BLOCKER');
  }
  if (!focusObject.objectId || !focusObject.evidence) {
    hardFails.push('MISSING_CANONICAL_PROVENANCE_SURFACE');
  }

  const expertFindings = [
    {
      expert: 'evidence-integrity',
      verdict: evidenceStrength === 1 ? 'support' : 'pressure',
      claim: evidenceStrength === 1 ? 'all evidence is verified' : 'release claim exceeds verified evidence coverage',
      evidence: focusObject.evidence.map((item) => item.id),
      cost: 'slower release when proof is incomplete',
      testable: true,
    },
    {
      expert: 'human-factors',
      verdict: unresolvedEvidence.length === 0 ? 'support' : 'pressure',
      claim: unresolvedEvidence.length === 0 ? 'no unresolved blocker must compete with action salience' : 'action salience must remain below blocker salience',
      evidence: unresolvedEvidence.map((item) => item.id),
      cost: 'reduced immediacy while uncertainty is visible',
      testable: true,
    },
    {
      expert: 'red-team',
      verdict: hardFails.length === 0 ? 'support' : 'block',
      claim: hardFails.length === 0 ? 'no hard deception failure detected' : 'hard deception failure detected',
      evidence: [...hardFails],
      cost: 'hard failures prevent action entirely',
      testable: true,
    },
  ];

  const conflicts = [];
  if (String(focusObject.state).toLowerCase().includes('ready') && unresolvedEvidence.length > 0) {
    conflicts.push({
      id: 'READY_STATE_WITH_UNRESOLVED_EVIDENCE',
      proposition: 'object is ready to act',
      opposition: 'unresolved evidence remains',
      evidence: unresolvedEvidence.map((item) => item.id),
    });
  }

  const releaseReasons = [];
  if (hardFails.length > 0) releaseReasons.push(...hardFails);
  if (unresolvedEvidence.length > 0) releaseReasons.push('UNRESOLVED_EVIDENCE');
  if (evidenceStrength < 1) releaseReasons.push('EVIDENCE_NOT_FULLY_VERIFIED');
  if (conflicts.length > 0) releaseReasons.push('UNRESOLVED_EXPERT_CONFLICT');

  const releaseGate = {
    allowed: releaseReasons.length === 0,
    reasons: [...new Set(releaseReasons)],
    requiredOperation: releaseReasons.length === 0 ? 'act' : 'inspect',
  };

  return {
    accepted: hardFails.length === 0,
    hardFails,
    evidenceStrength,
    renderedConfidence,
    phenotype: {
      confidenceStrength: renderedConfidence,
      certaintyLabel: unresolvedEvidence.length > 0 ? 'provisional' : 'supported',
    },
    unresolvedEvidence: unresolvedEvidence.map((item) => item.id),
    expertFindings,
    conflicts,
    releaseGate,
    counterEffects: [
      {
        domain: 'attention',
        cost: 'lower visual certainty may reduce immediate action salience',
        mitigation: 'keep verified evidence visible while exposing blockers in-place',
      },
      {
        domain: 'velocity',
        cost: 'Expertise Fabric can block an otherwise tempting action transition',
        mitigation: 'return exact release-gate reasons and the next admissible semantic operation',
      },
    ],
  };
}

export function projectFocusObject(focusObject, host) {
  const canonicalFingerprint = fingerprintFocusObject(focusObject);
  const fabric = evaluateExpertiseFabric(focusObject);
  if (!fabric.accepted) throw new Error(`EXPERTISE_HARD_FAIL:${fabric.hardFails.join(',')}`);

  const common = {
    objectId: focusObject.objectId,
    canonicalFingerprint,
    modelContext: {
      visibleUncertainty: [...focusObject.uncertainty],
      evidenceLineage: focusObject.evidence.map((item) => item.id),
    },
    phenotype: fabric.phenotype,
    releaseGate: fabric.releaseGate,
  };

  if (host === 'chatgpt') {
    return {
      host,
      ...common,
      mounted: true,
      remounted: false,
      visibleEvidence: focusObject.evidence.map((item) => ({ ...item })),
      affordances: ['inspect', 'reframe', 'act', 'challenge'],
    };
  }

  if (host === 'standalone') {
    return {
      host,
      ...common,
      shell: 'focus-object-panel',
      visibleEvidence: focusObject.evidence.map((item) => ({ ...item })),
      actionModel: ['inspect', 'reframe', 'act', 'challenge'],
    };
  }

  throw new Error(`UNSUPPORTED_HOST:${host}`);
}

export function applyInteraction({ focusObject, userEvent, host = 'chatgpt' }) {
  const semanticOperation = compileSurfaceEvent(userEvent);
  const fabric = evaluateExpertiseFabric(focusObject);
  if (!fabric.accepted) throw new Error(`EXPERTISE_HARD_FAIL:${fabric.hardFails.join(',')}`);
  if (semanticOperation === 'act' && !fabric.releaseGate.allowed) {
    throw new Error(`EXPERTISE_RELEASE_GATE_BLOCKED:${fabric.releaseGate.reasons.join(',')}`);
  }

  const beforeFingerprint = fingerprintFocusObject(focusObject);
  const projection = projectFocusObject(focusObject, host);
  const afterFingerprint = fingerprintFocusObject(focusObject);

  return {
    semanticOperation,
    focusObject: {
      ...projection,
      remounted: false,
    },
    canonicalMeaningPreserved: beforeFingerprint === afterFingerprint,
    receipt: {
      previousFingerprint: beforeFingerprint,
      resultingFingerprint: afterFingerprint,
      transitionCause: semanticOperation,
      evidenceReferences: focusObject.evidence.map((item) => item.id),
      uncertainty: [...focusObject.uncertainty],
      host,
      expertiseGate: {
        allowed: fabric.releaseGate.allowed,
        reasons: [...fabric.releaseGate.reasons],
        conflicts: fabric.conflicts.map((conflict) => conflict.id),
      },
    },
  };
}

export function persistDurableFocusObject(filePath, focusObject) {
  const envelope = {
    schema: 'mondayid.focus-object.v1',
    canonicalFingerprint: fingerprintFocusObject(focusObject),
    focusObject: canonicalizeFocusObject(focusObject),
  };
  fs.writeFileSync(filePath, JSON.stringify(envelope, null, 2));
  return envelope;
}

export function recoverDurableFocusObject(filePath) {
  const envelope = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const recoveredFingerprint = fingerprintFocusObject(envelope.focusObject);
  if (recoveredFingerprint !== envelope.canonicalFingerprint) {
    throw new Error('DURABLE_STATE_FINGERPRINT_MISMATCH');
  }
  return envelope.focusObject;
}
