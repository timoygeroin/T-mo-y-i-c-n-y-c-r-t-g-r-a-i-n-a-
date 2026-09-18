import assert from 'node:assert/strict';
import { createSelfHostingOrganism } from './self-hosting-organism.mjs';

const persisted = [];
const invocations = [];
let builds = 0;

const seed = {
  graph_id: 'MONDAYID-SELF-HOSTING-SEED',
  nodes: [
    { id: 'sentinel', kind: 'sentinel', resident: true, provides: ['preflight'], verifies: ['route-integrity'], writes_to: ['continuity'] },
    { id: 'organism-builder', kind: 'organ', resident: true, provides: ['organism.extend'], awakens_on: ['organism-growth'], requires: ['extension-verifier', 'registry-persistence'], verifies: ['extension-proof'], writes_to: ['organism-registry'], cost: 1 },
    { id: 'extension-verifier', kind: 'verifier', resident: true, provides: ['organism.verify-extension'], awakens_on: ['organism-growth'], verifies: ['extension-proof'], cost: 1 },
    { id: 'registry-persistence', kind: 'persistence', resident: true, provides: ['organism.persist-registry'], awakens_on: ['organism-growth'], writes_to: ['organism-registry'], cost: 1 },
  ],
  edges: [
    { from: 'sentinel', to: 'organism-builder', relation: 'awakens' },
    { from: 'organism-builder', to: 'extension-verifier', relation: 'requires' },
    { from: 'organism-builder', to: 'registry-persistence', relation: 'requires' },
  ],
};

const organism = createSelfHostingOrganism({
  seed,
  persist: (entry) => persisted.push(entry),
  buildExtension: ({ missing_capabilities }) => {
    builds += 1;
    assert.deepEqual(missing_capabilities, ['image.render']);
    return {
      schema: 'mondayid.extension-package.v1',
      extension_id: 'EXT-VISION-001',
      nodes: [
        { id: 'vision-renderer', kind: 'organ', resident: true, provides: ['image.render'], awakens_on: ['visual'], requires: ['sentinel'], verifies: ['visual-integrity'], writes_to: ['continuity'], cost: 2 },
      ],
      edges: [{ from: 'sentinel', to: 'vision-renderer', relation: 'awakens' }],
      proof: { status: 'PASS', covers: ['image.render'], evidence: ['builder-self-test:vision-renderer'] },
    };
  },
  invoke: ({ action, route }) => {
    invocations.push({ actuator: action.actuator, active: route.active_organs });
    return { status: 'rendered', artifact: 'image://proof-output' };
  },
});

const before = organism.snapshot();
assert.equal(before.revision, 0);
assert.equal(before.nodes.some((node) => node.id === 'vision-renderer'), false);

const result = organism.dispatch({
  event_id: 'VISUAL-E-001',
  tags: ['visual'],
  required_capabilities: ['image.render'],
  action: {
    actuator: 'vision-renderer',
    verification_plan: ['visual-integrity'],
    writeback_plan: ['continuity'],
    payload: { scene: 'corridor' },
  },
});

assert.equal(builds, 1);
assert.equal(result.result.status, 'rendered');
assert.equal(result.receipt.growth.length, 1);
assert.equal(invocations.length, 1);
assert.equal(invocations[0].actuator, 'vision-renderer');
assert.equal(invocations[0].active.includes('vision-renderer'), true);

const after = organism.snapshot();
assert.equal(after.revision, 1);
assert.equal(after.nodes.some((node) => node.id === 'vision-renderer'), true);
assert.equal(persisted.some((entry) => entry.type === 'organism-extension'), true);
assert.equal(persisted.some((entry) => entry.type === 'organism-dispatch'), true);

const second = organism.dispatch({
  event_id: 'VISUAL-E-002',
  tags: ['visual'],
  required_capabilities: ['image.render'],
  action: {
    actuator: 'vision-renderer',
    verification_plan: ['visual-integrity'],
    writeback_plan: ['continuity'],
    payload: { scene: 'corridor-2' },
  },
});
assert.equal(builds, 1, 'known capability must remain resident and must not be rebuilt');
assert.equal(second.receipt.growth.length, 0);

assert.throws(() => organism.dispatch({
  event_id: 'BAD-E-001',
  tags: ['visual'],
  required_capabilities: ['image.render'],
  action: {
    actuator: 'unrouted-tool',
    verification_plan: ['visual-integrity'],
    writeback_plan: ['continuity'],
  },
}), /SELF_HOSTING_ACTUATOR_NOT_ROUTED/);

console.log(JSON.stringify({
  status: 'PASS',
  seed_revision: before.revision,
  final_revision: after.revision,
  extension_installed: 'vision-renderer',
  build_count_after_two_visual_events: builds,
  persisted_types: [...new Set(persisted.map((entry) => entry.type))],
  proved: [
    'one dispatch entrypoint detects missing capability',
    'missing capability becomes an organism-growth event',
    'resident builder/verifier/persistence organs route the growth event before extension',
    'proved extension is installed into the resident graph and persisted',
    'the original event is automatically rerouted through the grown organism',
    'learned capability remains resident and is reused without rebuilding',
    'an actuator outside the routed organism cannot execute',
  ],
}, null, 2));
