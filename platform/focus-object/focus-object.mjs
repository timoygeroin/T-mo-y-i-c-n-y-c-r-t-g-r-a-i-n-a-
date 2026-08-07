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
    counterEffects: [
      {
        domain: 'attention',
        cost: 'lower visual certainty may reduce immediate action salience',
        mitigation: 'keep verified evidence visible while exposing blockers in-place',
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
