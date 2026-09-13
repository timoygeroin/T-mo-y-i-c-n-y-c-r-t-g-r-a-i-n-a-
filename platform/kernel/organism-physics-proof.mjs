import assert from 'node:assert/strict';
import {
  compileResidentGraph,
  routeEvent,
  admitAction,
  compileFailureGene,
  admitRetry,
  governedAct,
} from './organism-physics.mjs';

const graph = compileResidentGraph({
  graph_id: 'MONDAYID-ROOT-GRAPH-001',
  nodes: [
    { id: 'sentinel', kind: 'sentinel', resident: true, provides: ['preflight'], awakens_on: [], verifies: ['route-integrity'], writes_to: ['continuity'] },
    { id: 'continuity', kind: 'memory', resident: true, provides: ['recover'], awakens_on: ['continuity'], requires: ['sentinel'], writes_to: ['continuity'] },
    { id: 'vision', kind: 'organ', resident: true, provides: ['visual-edit'], awakens_on: ['visual'], requires: ['sentinel'], verifies: ['visual-result'], writes_to: ['visual-lineage'], cost: 2 },
    { id: 'third-path', kind: 'antibody', resident: true, provides: ['boundary-rewrite'], awakens_on: ['moderation-risk'], requires: ['sentinel'], verifies: ['boundary-preserved'], writes_to: ['failure-genes'], cost: 2 },
    { id: 'verifier', kind: 'verifier', resident: true, provides: ['verification'], awakens_on: ['external-action'], requires: ['sentinel'], verifies: ['external-result'], writes_to: ['receipts'], cost: 1 },
    { id: 'renderer', kind: 'tool', resident: true, provides: ['render'], awakens_on: ['visual'], requires: ['vision', 'verifier'], cost: 3 },
  ],
  edges: [
    { from: 'sentinel', to: 'vision', relation: 'awakens' },
    { from: 'vision', to: 'renderer', relation: 'routes' },
    { from: 'third-path', to: 'renderer', relation: 'constrains' },
  ],
});

const route = routeEvent(graph, {
  event_id: 'E-001',
  tags: ['visual', 'moderation-risk', 'external-action'],
  required_capabilities: ['visual-edit', 'boundary-rewrite', 'render', 'verification'],
});

assert(route.active_organs.includes('sentinel'));
assert(route.active_organs.includes('vision'));
assert(route.active_organs.includes('third-path'));
assert(route.active_organs.includes('verifier'));
assert(route.active_organs.includes('renderer'));

assert.throws(() => admitAction({
  graph,
  route: null,
  action: { event_id: 'E-001', actuator: 'renderer', verification_plan: ['check'], writeback_plan: ['receipt'] },
}), /ORGANISM_DIRECT_ACTION_BLOCKED/);

assert.throws(() => admitAction({
  graph,
  route,
  action: { event_id: 'E-001', actuator: 'renderer', verification_plan: [], writeback_plan: ['receipt'] },
}), /ORGANISM_VERIFICATION_PLAN_REQUIRED/);

let executed = 0;
const governed = governedAct({
  graph,
  route,
  action: {
    event_id: 'E-001',
    actuator: 'renderer',
    verification_plan: ['visual-result', 'boundary-preserved'],
    writeback_plan: ['visual-lineage', 'failure-genes', 'receipts'],
  },
  execute: () => { executed += 1; return { ok: true }; },
});
assert.equal(executed, 1);
assert.equal(governed.admission.admitted, true);

const failure = compileFailureGene({
  event_id: 'E-001',
  failure_class: 'REPEATED_UNCHANGED_RETRY',
  locus: 'visual.boundary-routing',
  invariant: 'known failure must alter mechanism before retry',
  evidence: ['moderation-fail-1', 'moderation-fail-2'],
});

assert.throws(() => admitRetry({ prior_failure_gene: failure, mutation_receipt: null, next_event_id: 'E-002' }), /ORGANISM_UNCHANGED_RETRY_BLOCKED/);

const retry = admitRetry({
  prior_failure_gene: failure,
  next_event_id: 'E-002',
  mutation_receipt: {
    failure_signature: failure.signature,
    changed_mechanism: 'activate third-path before renderer',
    proof: 'route E-002 contains third-path before actuator admission',
  },
});
assert.equal(retry.admitted, true);

console.log(JSON.stringify({
  status: 'PASS',
  graph_fingerprint: graph.fingerprint,
  route_fingerprint: route.route_fingerprint,
  active_organs: route.active_organs,
  failure_signature: failure.signature,
  proved: [
    'resident sentinel always participates',
    'direct event-to-action is blocked',
    'verification and writeback are mandatory',
    'relevant organs activate by event/capability rather than after failure',
    'unchanged retry after a known failure is blocked',
    'retry is admitted only after a mechanism mutation with proof',
  ],
}, null, 2));
