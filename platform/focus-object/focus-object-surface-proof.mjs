import assert from 'node:assert/strict';
import { mountFocusObjectSurface, interactWithFocusObjectSurface } from './focus-object-surface.mjs';

const focusObject = {
  objectId: 'focus:first-product',
  intent: 'Ship the first MondayID Focus Object interaction',
  state: 'ready to ship',
  delta: 'three verified checks, one unresolved blocker',
  evidence: [
    { id: 'E1', claim: 'canonical state exists', status: 'verified' },
    { id: 'E2', claim: 'semantic interaction compiles', status: 'verified' },
    { id: 'E3', claim: 'durable fingerprint survives recovery', status: 'verified' },
    { id: 'B1', claim: 'live user-host rendering is not yet independently observed', status: 'unresolved' },
  ],
  uncertainty: ['B1'],
};

const mounted = mountFocusObjectSurface(focusObject);
assert.match(mounted.html, /data-focus-object-id="focus:first-product"/);
assert.match(mounted.html, /data-confidence="60"/);
assert.match(mounted.html, /data-certainty="provisional"/);
assert.match(mounted.html, /data-blocker-id="B1"/);
assert.match(mounted.html, /data-release-allowed="false"/);
assert.match(mounted.html, /data-release-reasons="[^"]*UNRESOLVED_EVIDENCE/);
assert.match(mounted.html, /data-operation="act" disabled aria-disabled="true"/);
assert.match(mounted.html, /Act blocked · inspect first/);
for (const op of ['inspect', 'reframe', 'challenge']) assert.match(mounted.html, new RegExp(`data-operation="${op}"`));

const inspect = interactWithFocusObjectSurface({ focusObject, surfaceAction: 'confidence' });
assert.equal(inspect.semanticOperation, 'inspect');
assert.equal(inspect.canonicalMeaningPreserved, true);
assert.equal(inspect.receipt.previousFingerprint, inspect.receipt.resultingFingerprint);
assert.deepEqual(inspect.receipt.uncertainty, ['B1']);
assert.equal(inspect.receipt.expertiseGate.allowed, false);
assert.match(inspect.surface.html, /data-confidence="60"/);

for (const op of ['inspect', 'reframe', 'challenge']) {
  const result = interactWithFocusObjectSurface({ focusObject, surfaceAction: op });
  assert.equal(result.semanticOperation, op);
  assert.equal(result.canonicalMeaningPreserved, true);
}

assert.throws(
  () => interactWithFocusObjectSurface({ focusObject, surfaceAction: 'act' }),
  /EXPERTISE_RELEASE_GATE_BLOCKED/,
);

const verified = {
  ...focusObject,
  state: 'verified',
  delta: 'all release evidence verified',
  evidence: focusObject.evidence.map((item) => ({ ...item, status: 'verified' })),
  uncertainty: [],
};
const verifiedMounted = mountFocusObjectSurface(verified);
assert.match(verifiedMounted.html, /data-release-allowed="true"/);
assert.doesNotMatch(verifiedMounted.html, /data-operation="act" disabled/);
const act = interactWithFocusObjectSurface({ focusObject: verified, surfaceAction: 'act' });
assert.equal(act.semanticOperation, 'act');
assert.equal(act.receipt.expertiseGate.allowed, true);

const deceptive = {
  ...focusObject,
  evidence: [{ id: 'B1', claim: 'only unresolved evidence remains', status: 'unresolved' }],
};
assert.throws(() => mountFocusObjectSurface(deceptive), /ILLUSION_DETECTOR_CONFIDENCE_EXCEEDS_EVIDENCE/);

console.log(JSON.stringify({
  testId: 'FOCUS_OBJECT_SURFACE_TEST_001',
  result: 'PASS',
  mounted: true,
  canonicalFingerprint: mounted.fingerprint,
  confidencePercent: 60,
  blockerVisible: 'B1',
  confidenceTapCompilesTo: inspect.semanticOperation,
  provisionalOperationsProven: ['inspect', 'reframe', 'challenge'],
  provisionalActBlockedByExpertiseFabric: true,
  verifiedActAllowedByExpertiseFabric: true,
  deceptiveSurfaceRejected: true,
}, null, 2));
