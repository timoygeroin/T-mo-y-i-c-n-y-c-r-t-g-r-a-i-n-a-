import assert from 'node:assert/strict';
import {
  applyFocusObjectInteraction,
  resolveFocusObjectEvidence,
} from './focus-object-evidence-transition.mjs';
import {
  evaluateExpertiseFabric,
  fingerprintFocusObject,
} from './focus-object.mjs';

const provisional = {
  objectId: 'focus:evidence-transition',
  intent: 'advance Focus Object from unresolved proof to releaseable canon',
  state: 'ready to ship',
  delta: 'three proofs verified, one canonical blocker unresolved',
  evidence: [
    { id: 'E1', claim: 'canonical state exists', status: 'verified' },
    { id: 'E2', claim: 'live host interaction exists', status: 'verified' },
    { id: 'E3', claim: 'second host preserves meaning', status: 'verified' },
    { id: 'B1', claim: 'expert resolution has not yet advanced canon', status: 'unresolved' },
  ],
  uncertainty: ['B1'],
};

const beforeFingerprint = fingerprintFocusObject(provisional);
const beforeFabric = evaluateExpertiseFabric(provisional);
assert.equal(beforeFabric.releaseGate.allowed, false);
assert.ok(beforeFabric.releaseGate.reasons.includes('UNRESOLVED_EVIDENCE'));

const transition = resolveFocusObjectEvidence({
  focusObject: provisional,
  host: 'standalone',
  resolution: {
    evidenceId: 'B1',
    verdict: 'verified',
    rationale: 'machine proof observed the expert-gated evidence transition',
    evidenceReferences: ['PROOF:FOCUS_OBJECT_EVIDENCE_TRANSITION_001'],
    delta: 'expert-gated evidence transition verified and committed to canonical state',
  },
});

assert.equal(transition.semanticOperation, 'challenge');
assert.equal(transition.canonicalMeaningPreserved, true);
assert.equal(transition.canonicalStateAdvanced, true);
assert.notEqual(transition.receipt.previousFingerprint, transition.receipt.resultingFingerprint);
assert.equal(transition.receipt.previousFingerprint, beforeFingerprint);
assert.equal(transition.receipt.evidenceTransition.evidenceId, 'B1');
assert.equal(transition.receipt.evidenceTransition.from, 'unresolved');
assert.equal(transition.receipt.evidenceTransition.to, 'verified');
assert.deepEqual(transition.receipt.uncertainty, []);
assert.equal(transition.receipt.expertiseGateBefore.allowed, false);
assert.equal(transition.receipt.expertiseGate.allowed, true);
assert.deepEqual(transition.receipt.expertiseGate.reasons, []);
assert.deepEqual(transition.canonicalFocusObject.uncertainty, []);
assert.equal(transition.canonicalFocusObject.evidence.find((item) => item.id === 'B1').status, 'verified');
assert.equal(
  transition.canonicalFocusObject.evidence.find((item) => item.id === 'B1').resolution.evidenceReferences[0],
  'PROOF:FOCUS_OBJECT_EVIDENCE_TRANSITION_001',
);

const afterFabric = evaluateExpertiseFabric(transition.canonicalFocusObject);
assert.equal(afterFabric.releaseGate.allowed, true);
assert.equal(afterFabric.releaseGate.requiredOperation, 'act');

const act = applyFocusObjectInteraction({
  focusObject: transition.canonicalFocusObject,
  userEvent: { semanticOperation: 'act' },
  host: 'standalone',
});
assert.equal(act.semanticOperation, 'act');
assert.equal(act.canonicalStateAdvanced, false);
assert.equal(act.receipt.expertiseGate.allowed, true);

assert.throws(
  () => resolveFocusObjectEvidence({
    focusObject: provisional,
    resolution: {
      evidenceId: 'B1',
      verdict: 'verified',
      rationale: 'missing provenance must be rejected',
      evidenceReferences: [],
    },
  }),
  /EVIDENCE_RESOLUTION_PROVENANCE_REQUIRED/,
);

assert.throws(
  () => applyFocusObjectInteraction({
    focusObject: provisional,
    userEvent: {
      semanticOperation: 'inspect',
      evidenceResolution: {
        evidenceId: 'B1',
        verdict: 'verified',
        rationale: 'wrong operation',
        evidenceReferences: ['X'],
      },
    },
  }),
  /EVIDENCE_RESOLUTION_REQUIRES_CHALLENGE/,
);

console.log(JSON.stringify({
  testId: 'FOCUS_OBJECT_EVIDENCE_TRANSITION_001',
  result: 'PASS',
  previousFingerprint: beforeFingerprint,
  resultingFingerprint: transition.receipt.resultingFingerprint,
  canonicalStateAdvanced: true,
  resolvedEvidence: 'B1',
  uncertaintyAfter: transition.canonicalFocusObject.uncertainty,
  releaseAllowedBefore: false,
  releaseAllowedAfter: true,
  actAllowedAfterResolution: true,
  provenanceRequired: true,
}, null, 2));
