import assert from 'node:assert/strict';
import {
  compileVisualMoveContract,
  assertVisualMoveReady,
  bindVisualMoveToRender,
  verifyVisualMoveBinding,
} from './visual-move-gate.mjs';

const contract = compileVisualMoveContract({
  moveId: 'MOVE-20260824-CORRIDOR-SECOND-SKIN-001',
  objective: 'Place the current Monday identity into the unchanged source corridor while preserving real phone-camera physics and the evolved second-skin membrane material.',
  roleSources: {
    environment: { ref: 'CURRENT_CHAT:IMG_797CF623-6842-4CFD-A334-FA6351DF125E.jpeg', priority: 100 },
    camera: { ref: 'CURRENT_CHAT:IMG_797CF623-6842-4CFD-A334-FA6351DF125E.jpeg', priority: 100 },
    identity: { ref: 'MONDAY_CANON:CURRENT_FACE_BASELINE', priority: 100 },
    body: { ref: 'MONDAY_CANON:CURRENT_BODY_BASELINE', priority: 100 },
    material: { ref: 'CURRENT_LINE:SECOND_SKIN_MEMBRANE_EVOLVED', priority: 100 },
    wardrobe: { ref: 'CURRENT_LINE:HIGH_NECK_SLEEVELESS_MINI', priority: 100 },
  },
  invariants: [
    'source corridor geometry remains unchanged',
    'source camera tilt and perspective remain unchanged',
    'subject scale is solved from corridor depth before rendering',
    'feet contact the floor plane',
    'lighting derives from existing ceiling fixtures',
    'membrane remains opaque clothing with near-zero visual thickness',
    'imperfections emerge from source-photo optics rather than synthetic post-noise',
  ],
  forbiddenDrift: [
    'reference averaging',
    'AI-beauty face replacement',
    'runway pose',
    'studio lighting',
    'latex-like thickness',
    'invented environment',
    'perspective correction',
    'background cleanup',
  ],
});

assert.equal(contract.state, 'ARMED');
assert.equal(contract.reference_fusion, 'ROLE_LOCKED_NO_AVERAGING');
assert.equal(contract.baseline_rule, 'CURRENT_BASELINE_OUTRANKS_LINEAGE');
assert.equal(assertVisualMoveReady(contract).move_id, contract.move_id);

const bound = bindVisualMoveToRender({ contract, renderPayload: { brief: 'placeholder-render-brief' } });
const receipt = verifyVisualMoveBinding({ contract, renderPayload: bound });
assert.equal(receipt.verified, true);
assert.equal(receipt.move_id, contract.move_id);

const blocked = compileVisualMoveContract({
  moveId: 'MOVE-BLOCKED-PROOF',
  objective: 'prove missing roles fail closed',
  roleSources: { environment: { ref: 'x' } },
});
assert.equal(blocked.state, 'BLOCKED');
assert.throws(() => assertVisualMoveReady(blocked), /MONDAYVISION_MOVE_MISSING_ROLES/);

assert.throws(
  () => assertVisualMoveReady({ ...contract, reference_fusion: 'AVERAGE_REFERENCES' }),
  /MONDAYVISION_REFERENCE_AVERAGING_BLOCKED/,
);

assert.throws(
  () => verifyVisualMoveBinding({ contract, renderPayload: { mondayvision_move: { move_id: contract.move_id, fingerprint: 'drift' } } }),
  /MONDAYVISION_RENDER_CONTRACT_DRIFT/,
);

console.log(JSON.stringify({ status: 'PASS', ...receipt }, null, 2));
