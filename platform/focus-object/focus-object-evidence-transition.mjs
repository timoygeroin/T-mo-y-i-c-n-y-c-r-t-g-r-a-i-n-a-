import {
  applyInteraction,
  canonicalizeFocusObject,
  evaluateExpertiseFabric,
  fingerprintFocusObject,
  projectFocusObject,
} from './focus-object.mjs';

function normalizedReferences(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
}

export function resolveFocusObjectEvidence({ focusObject, resolution, host = 'standalone' }) {
  const evidenceId = String(resolution?.evidenceId ?? '').trim();
  const verdict = String(resolution?.verdict ?? '').trim().toLowerCase();
  const rationale = String(resolution?.rationale ?? '').trim();
  const evidenceReferences = normalizedReferences(resolution?.evidenceReferences);

  if (!evidenceId) throw new Error('EVIDENCE_RESOLUTION_ID_REQUIRED');
  if (verdict !== 'verified') throw new Error(`EVIDENCE_RESOLUTION_VERDICT_UNSUPPORTED:${verdict || 'missing'}`);
  if (!rationale) throw new Error('EVIDENCE_RESOLUTION_RATIONALE_REQUIRED');
  if (evidenceReferences.length === 0) throw new Error('EVIDENCE_RESOLUTION_PROVENANCE_REQUIRED');

  const before = canonicalizeFocusObject(focusObject);
  const beforeFingerprint = fingerprintFocusObject(before);
  const beforeFabric = evaluateExpertiseFabric(before);
  if (!beforeFabric.accepted) throw new Error(`EXPERTISE_HARD_FAIL:${beforeFabric.hardFails.join(',')}`);

  // A resolution is a challenged claim becoming evidence-backed canon. Reuse the
  // existing challenge admission path so this transition cannot bypass Expertise Fabric.
  applyInteraction({
    focusObject: before,
    userEvent: { semanticOperation: 'challenge' },
    host,
  });

  const target = before.evidence.find((item) => item.id === evidenceId);
  if (!target) throw new Error(`EVIDENCE_RESOLUTION_TARGET_NOT_FOUND:${evidenceId}`);

  const unresolved = target.status === 'unresolved' || before.uncertainty.includes(evidenceId);
  if (!unresolved) throw new Error(`EVIDENCE_RESOLUTION_TARGET_NOT_UNRESOLVED:${evidenceId}`);

  const next = canonicalizeFocusObject(before);
  const nextTarget = next.evidence.find((item) => item.id === evidenceId);
  nextTarget.status = 'verified';
  nextTarget.resolution = {
    verdict: 'verified',
    rationale,
    evidenceReferences,
  };
  next.uncertainty = next.uncertainty.filter((id) => id !== evidenceId);
  next.delta = String(resolution?.delta ?? `Resolved ${evidenceId}: ${rationale}`);

  const afterFabric = evaluateExpertiseFabric(next);
  if (!afterFabric.accepted) throw new Error(`EXPERTISE_HARD_FAIL_AFTER_RESOLUTION:${afterFabric.hardFails.join(',')}`);

  const resultingFingerprint = fingerprintFocusObject(next);
  if (resultingFingerprint === beforeFingerprint) throw new Error('EVIDENCE_RESOLUTION_DID_NOT_ADVANCE_CANON');

  const identityPreserved = before.objectId === next.objectId && before.intent === next.intent;
  if (!identityPreserved) throw new Error('EVIDENCE_RESOLUTION_CHANGED_FOCUS_IDENTITY');

  return {
    semanticOperation: 'challenge',
    canonicalMeaningPreserved: true,
    canonicalStateAdvanced: true,
    canonicalFocusObject: next,
    focusObject: {
      ...projectFocusObject(next, host),
      remounted: false,
    },
    receipt: {
      previousFingerprint: beforeFingerprint,
      resultingFingerprint,
      transitionCause: 'challenge:evidence-resolution',
      evidenceReferences: next.evidence.map((item) => item.id),
      uncertainty: [...next.uncertainty],
      host,
      evidenceTransition: {
        evidenceId,
        from: target.status,
        to: 'verified',
        rationale,
        evidenceReferences,
      },
      expertiseGateBefore: {
        allowed: beforeFabric.releaseGate.allowed,
        reasons: [...beforeFabric.releaseGate.reasons],
        conflicts: beforeFabric.conflicts.map((item) => item.id),
      },
      expertiseGate: {
        allowed: afterFabric.releaseGate.allowed,
        reasons: [...afterFabric.releaseGate.reasons],
        conflicts: afterFabric.conflicts.map((item) => item.id),
      },
    },
  };
}

export function applyFocusObjectInteraction({ focusObject, userEvent, host = 'standalone' }) {
  if (userEvent?.evidenceResolution) {
    if (userEvent?.semanticOperation !== 'challenge') {
      throw new Error('EVIDENCE_RESOLUTION_REQUIRES_CHALLENGE');
    }
    return resolveFocusObjectEvidence({
      focusObject,
      resolution: userEvent.evidenceResolution,
      host,
    });
  }

  const result = applyInteraction({ focusObject, userEvent, host });
  return {
    ...result,
    canonicalStateAdvanced: false,
    canonicalFocusObject: canonicalizeFocusObject(focusObject),
  };
}
