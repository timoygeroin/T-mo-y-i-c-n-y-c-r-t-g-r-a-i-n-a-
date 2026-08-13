import assert from 'node:assert/strict';
import {
  applyInteraction,
  evaluateExpertiseFabric,
  fingerprintFocusObject,
} from './focus-object.mjs';

const provisional = {
  objectId: 'focus:expertise-release-gate',
  intent: 'ship the first Focus Object interaction safely',
  state: 'ready to ship',
  delta: 'interaction surface and durable recovery are proven',
  evidence: [
    { id: 'E1', claim: 'primary live host click reaches canonical interaction', status: 'verified' },
    { id: 'E2', claim: 'durable process restart preserves canonical fingerprint', status: 'verified' },
    { id: 'E3', claim: 'secondary renderer preserves canonical meaning', status: 'verified' },
    { id: 'B1', claim: 'release decision has explicit expertise-gated transition semantics', status: 'unresolved' },
  ],
  uncertainty: ['B1'],
};

const provisionalFingerprint = fingerprintFocusObject(provisional);
const provisionalFabric = evaluateExpertiseFabric(provisional);
assert.equal(provisionalFabric.accepted, true);
assert.equal(provisionalFabric.releaseGate.allowed, false);
assert.equal(provisionalFabric.releaseGate.requiredOperation, 'inspect');
assert.ok(provisionalFabric.releaseGate.reasons.includes('UNRESOLVED_EVIDENCE'));
assert.ok(provisionalFabric.releaseGate.reasons.includes('EVIDENCE_NOT_FULLY_VERIFIED'));
assert.ok(provisionalFabric.releaseGate.reasons.includes('UNRESOLVED_EXPERT_CONFLICT'));
assert.ok(provisionalFabric.conflicts.some((item) => item.id === 'READY_STATE_WITH_UNRESOLVED_EVIDENCE'));
assert.equal(provisionalFabric.expertFindings.length, 3);

const inspect = applyInteraction({
  focusObject: provisional,
  userEvent: { semanticOperation: 'inspect' },
  host: 'standalone',
});
assert.equal(inspect.semanticOperation, 'inspect');
assert.equal(inspect.canonicalMeaningPreserved, true);
assert.equal(inspect.receipt.expertiseGate.allowed, false);
assert.ok(inspect.receipt.expertiseGate.conflicts.includes('READY_STATE_WITH_UNRESOLVED_EVIDENCE'));
assert.equal(inspect.receipt.previousFingerprint, provisionalFingerprint);
assert.equal(inspect.receipt.resultingFingerprint, provisionalFingerprint);

assert.throws(
  () => applyInteraction({
    focusObject: provisional,
    userEvent: { semanticOperation: 'act' },
    host: 'standalone',
  }),
  /EXPERTISE_RELEASE_GATE_BLOCKED:.*UNRESOLVED_EVIDENCE/,
);

const verified = {
  ...provisional,
  state: 'verified',
  delta: 'all release evidence is now verified',
  evidence: provisional.evidence.map((item) => ({ ...item, status: 'verified' })),
  uncertainty: [],
};
const verifiedFabric = evaluateExpertiseFabric(verified);
assert.equal(verifiedFabric.accepted, true);
assert.equal(verifiedFabric.releaseGate.allowed, true);
assert.deepEqual(verifiedFabric.releaseGate.reasons, []);
assert.deepEqual(verifiedFabric.conflicts, []);
assert.equal(verifiedFabric.releaseGate.requiredOperation, 'act');

const act = applyInteraction({
  focusObject: verified,
  userEvent: { semanticOperation: 'act' },
  host: 'standalone',
});
assert.equal(act.semanticOperation, 'act');
assert.equal(act.receipt.expertiseGate.allowed, true);
assert.deepEqual(act.receipt.expertiseGate.reasons, []);
assert.equal(act.canonicalMeaningPreserved, true);

console.log(JSON.stringify({
  testId: 'FOCUS_OBJECT_EXPERTISE_RELEASE_GATE_001',
  result: 'PASS',
  provisional: {
    fingerprint: provisionalFingerprint,
    releaseAllowed: provisionalFabric.releaseGate.allowed,
    reasons: provisionalFabric.releaseGate.reasons,
    conflictIds: provisionalFabric.conflicts.map((item) => item.id),
    inspectStillAllowed: true,
    actBlocked: true,
  },
  verified: {
    fingerprint: fingerprintFocusObject(verified),
    releaseAllowed: verifiedFabric.releaseGate.allowed,
    actAllowed: true,
  },
  counterEffectsRecorded: provisionalFabric.counterEffects.length,
}, null, 2));
