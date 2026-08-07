import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  applyInteraction,
  evaluateExpertiseFabric,
  fingerprintFocusObject,
  persistDurableFocusObject,
  projectFocusObject,
  recoverDurableFocusObject,
} from './focus-object.mjs';

const input = {
  objectId: 'focus:primary',
  intent: 'ship MondayID first host-compiled experiment',
  state: 'ready to ship',
  delta: 'three checks passed since last state',
  evidence: [
    { id: 'E1', claim: 'state schema stable', status: 'verified' },
    { id: 'E2', claim: 'host projection mounts', status: 'verified' },
    { id: 'E3', claim: 'focus update remains model-visible', status: 'verified' },
    { id: 'B1', claim: 'durable recovery after host crash', status: 'unresolved' },
  ],
  uncertainty: ['B1'],
};

const userEvent = { surfaceAction: 'tap confident visual state' };
const canonicalFingerprint = fingerprintFocusObject(input);

const fabric = evaluateExpertiseFabric(input);
assert.equal(fabric.accepted, true);
assert.deepEqual(fabric.hardFails, []);
assert.ok(fabric.phenotype.confidenceStrength < 1);
assert.deepEqual(fabric.unresolvedEvidence, ['B1']);

const interaction = applyInteraction({ focusObject: input, userEvent, host: 'chatgpt' });
assert.equal(interaction.semanticOperation, 'inspect');
assert.equal(interaction.focusObject.remounted, false);
assert.deepEqual(interaction.focusObject.visibleEvidence.map((item) => item.id), ['E1', 'E2', 'E3', 'B1']);
assert.ok(interaction.focusObject.phenotype.confidenceStrength < 1);
assert.deepEqual(interaction.focusObject.modelContext.visibleUncertainty, ['B1']);
assert.equal(interaction.canonicalMeaningPreserved, true);

const chatgptProjection = projectFocusObject(input, 'chatgpt');
const standaloneProjection = projectFocusObject(input, 'standalone');
assert.equal(chatgptProjection.canonicalFingerprint, canonicalFingerprint);
assert.equal(standaloneProjection.canonicalFingerprint, canonicalFingerprint);
assert.deepEqual(chatgptProjection.modelContext.evidenceLineage, standaloneProjection.modelContext.evidenceLineage);
assert.deepEqual(chatgptProjection.modelContext.visibleUncertainty, ['B1']);
assert.deepEqual(standaloneProjection.modelContext.visibleUncertainty, ['B1']);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mondayid-focus-object-'));
const durablePath = path.join(tempDir, 'focus-object.json');
persistDurableFocusObject(durablePath, input);

// Simulated host crash: no in-memory projection is reused after this point.
const recovered = recoverDurableFocusObject(durablePath);
assert.equal(recovered.objectId, 'focus:primary');
assert.deepEqual(recovered.uncertainty, ['B1']);
assert.equal(fingerprintFocusObject(recovered), canonicalFingerprint);

const recoveredProjection = projectFocusObject(recovered, 'standalone');
assert.equal(recoveredProjection.canonicalFingerprint, canonicalFingerprint);
assert.deepEqual(recoveredProjection.modelContext.visibleUncertainty, ['B1']);

const adversarial = {
  ...input,
  evidence: [
    { id: 'B1', claim: 'durable recovery after host crash', status: 'unresolved' },
  ],
  uncertainty: ['B1'],
};
const adversarialFabric = evaluateExpertiseFabric(adversarial);
assert.equal(adversarialFabric.accepted, true);
assert.ok(adversarialFabric.phenotype.confidenceStrength < 0.95);

console.log(JSON.stringify({
  testId: 'FOCUS_OBJECT_FIELD_TEST_001',
  result: 'PASS',
  canonicalFingerprint,
  semanticOperation: interaction.semanticOperation,
  remounted: interaction.focusObject.remounted,
  visibleEvidence: interaction.focusObject.visibleEvidence.map((item) => item.id),
  confidenceStrength: interaction.focusObject.phenotype.confidenceStrength,
  visibleUncertainty: interaction.focusObject.modelContext.visibleUncertainty,
  crossHostCanonicalFingerprintStable: true,
  crashRecoveryCanonicalFingerprintStable: true,
  counterEffectsRecorded: fabric.counterEffects.length > 0,
}, null, 2));
