import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyFocusObjectInteraction, resolveFocusObjectEvidence } from './focus-object-evidence-transition.mjs';
import {
  evaluateExpertiseFabric,
  fingerprintFocusObject,
  persistDurableFocusObject,
  projectFocusObject,
  recoverDurableFocusObject,
} from './focus-object.mjs';
import { interactWithFocusObjectSurface, mountFocusObjectSurface } from './focus-object-surface.mjs';

// This is a captured real cross-source claim, not a synthetic product fixture.
// The referenced records remain independently readable in MondayID's external control plane.
const focusObject = {
  objectId: 'focus:human:reconciliation-017',
  intent: 'Continue MondayID from canonical state 017 without replaying completed semantic ordinal 066',
  state: 'ready to continue',
  delta: 'canonical head 017 exists; independent completion evidence for ordinal 066 still requires challenge-bound admission',
  evidence: [
    {
      id: 'DIMA_COMMAND',
      claim: 'Dima requires stale or completed moves to be rejected before execution',
      status: 'verified',
      provenance: 'newest explicit automation instruction received 2026-08-12',
    },
    {
      id: 'CANONICAL_HEAD_017',
      claim: 'STATE-20260812-MONDAYID-RECONCILED-017 is the live canonical head',
      status: 'verified',
      provenance: 'AIRTABLE:06_CURRENT_STATE:recucTh1pw9UbfMuR',
    },
    {
      id: 'ORDINAL_066_COMPLETION',
      claim: 'SEMANTIC_ORDINAL_066 is independently complete and must not be replayed',
      status: 'unresolved',
      provenance: 'pending challenge-bound readback',
    },
  ],
  uncertainty: ['ORDINAL_066_COMPLETION'],
};

const beforeFingerprint = fingerprintFocusObject(focusObject);
const beforeFabric = evaluateExpertiseFabric(focusObject);
assert.equal(beforeFabric.releaseGate.allowed, false);
assert.ok(beforeFabric.unresolvedEvidence.includes('ORDINAL_066_COMPLETION'));

const inspect = interactWithFocusObjectSurface({ focusObject, surfaceAction: 'inspect' });
assert.equal(inspect.semanticOperation, 'inspect');
assert.equal(inspect.canonicalStateAdvanced, false);
assert.equal(inspect.surface.releaseGate.allowed, false);
assert.match(inspect.surface.html, /ORDINAL_066_COMPLETION/);
assert.match(inspect.surface.html, /disabled aria-disabled="true"/);

assert.throws(
  () => applyFocusObjectInteraction({
    focusObject,
    userEvent: { semanticOperation: 'act' },
    host: 'standalone',
  }),
  /EXPERTISE_RELEASE_GATE_BLOCKED/,
);

const transition = resolveFocusObjectEvidence({
  focusObject,
  host: 'standalone',
  resolution: {
    evidenceId: 'ORDINAL_066_COMPLETION',
    verdict: 'verified',
    rationale: 'live RUN_LOG completion receipt and reconciled canonical head independently close ordinal 066',
    evidenceReferences: [
      'AIRTABLE:05_RUN_LOG:reccnD5oWVBI4dG36',
      'AIRTABLE:06_CURRENT_STATE:recucTh1pw9UbfMuR',
      'AIRTABLE:05_RUN_LOG:rec4IGU1ohE0G8wtX',
      'LIBRARY:ADJUDICATION:libfile_a1c60b4a234c81918d9548cf4a4101d7',
    ],
    delta: 'ordinal 066 rejected as stale; continue from canonical 017 at the human Focus Object canary',
  },
});

assert.equal(transition.canonicalStateAdvanced, true);
assert.equal(transition.receipt.previousFingerprint, beforeFingerprint);
assert.notEqual(transition.receipt.resultingFingerprint, beforeFingerprint);
assert.equal(transition.receipt.expertiseGateBefore.allowed, false);
assert.equal(transition.receipt.expertiseGate.allowed, true);
assert.deepEqual(transition.canonicalFocusObject.uncertainty, []);

const stateFile = path.join(os.tmpdir(), `mondayid-first-human-focus-${process.pid}.json`);
try {
  persistDurableFocusObject(stateFile, transition.canonicalFocusObject);
  const recovered = recoverDurableFocusObject(stateFile);
  const recoveredFingerprint = fingerprintFocusObject(recovered);
  assert.equal(recoveredFingerprint, transition.receipt.resultingFingerprint);

  const primaryProjection = mountFocusObjectSurface(recovered);
  const secondaryProjection = projectFocusObject(recovered, 'chatgpt');
  assert.equal(primaryProjection.fingerprint, recoveredFingerprint);
  assert.equal(secondaryProjection.canonicalFingerprint, recoveredFingerprint);
  assert.equal(primaryProjection.releaseGate.allowed, true);
  assert.equal(secondaryProjection.releaseGate.allowed, true);

  const usefulAction = applyFocusObjectInteraction({
    focusObject: recovered,
    userEvent: { semanticOperation: 'act' },
    host: 'standalone',
  });
  assert.equal(usefulAction.semanticOperation, 'act');
  assert.equal(usefulAction.receipt.expertiseGate.allowed, true);
  assert.equal(usefulAction.receipt.resultingFingerprint, recoveredFingerprint);

  console.log(JSON.stringify({
    testId: 'FIRST_HUMAN_FOCUS_OBJECT_001',
    result: 'PASS',
    claimSource: 'DIMA_COMMAND',
    realEvidenceReferences: transition.receipt.evidenceTransition.evidenceReferences,
    blockerVisibleBefore: true,
    actBlockedBefore: true,
    staleMoveRejected: 'SEMANTIC_ORDINAL_066',
    previousFingerprint: beforeFingerprint,
    resultingFingerprint: recoveredFingerprint,
    durableRecovery: true,
    secondProjectionSameFingerprint: true,
    usefulActionAdmittedAfterEvidenceGate: true,
    nextMove: 'continue from STATE-20260812-MONDAYID-RECONCILED-017; do not start ordinal 067 by sequence alone',
  }, null, 2));
} finally {
  fs.rmSync(stateFile, { force: true });
}
