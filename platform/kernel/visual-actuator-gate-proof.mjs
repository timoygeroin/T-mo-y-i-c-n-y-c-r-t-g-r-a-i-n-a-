import assert from 'node:assert/strict';
import { compileResidentGraph, routeEvent } from './organism-physics.mjs';
import {
  compileVisualEvent,
  admitVisualActuator,
  governedVisualAct,
  compilePrematureVisualFailureGene,
} from './visual-actuator-boundary.mjs';

const graph = compileResidentGraph({
  graph_id: 'MONDAYID-VISUAL-ACTUATOR-GRAPH-001',
  nodes: [
    { id: 'sentinel', kind: 'sentinel', resident: true, provides: ['preflight'], verifies: ['route-integrity'], writes_to: ['continuity'] },
    { id: 'mondayvision', kind: 'organ', resident: true, provides: ['visual-route'], awakens_on: ['visual'], requires: ['sentinel'], verifies: ['temporal-gate', 'source-world-lock'], writes_to: ['visual-continuity'], cost: 1 },
    { id: 'renderer', kind: 'tool', resident: true, provides: ['render'], awakens_on: ['visual'], requires: ['mondayvision'], cost: 2 },
  ],
  edges: [
    { from: 'sentinel', to: 'mondayvision', relation: 'awakens' },
    { from: 'mondayvision', to: 'renderer', relation: 'admits' },
  ],
});

const route = routeEvent(graph, {
  event_id: 'VISUAL-E-001',
  tags: ['visual', 'external-action'],
  required_capabilities: ['visual-route', 'render'],
});

const action = {
  event_id: 'VISUAL-E-001',
  actuator: 'renderer',
  verification_plan: ['temporal-gate', 'source-world-lock', 'render-readback'],
  writeback_plan: ['visual-continuity'],
};

let executions = 0;

const beforeTransition = compileVisualEvent({
  event_id: 'VISUAL-E-001',
  source_world_fingerprint: 'source-world:turnstile-photo:47x40',
  temporal_gate: { kind: 'after-event', state: 'pending', trigger: 'user physically passes the turnstile' },
  release_condition: 'post-transition world preserves source camera/geometry/light and contains Monday naturally',
  evidence: ['user said: after I pass, inspect the point'],
});

const held = governedVisualAct({
  graph,
  route,
  visual_event: beforeTransition,
  action,
  execute: () => { executions += 1; return 'rendered'; },
});
assert.equal(held.admission.decision, 'HOLD');
assert.equal(held.result, null);
assert.equal(executions, 0);

const afterTransition = compileVisualEvent({
  event_id: 'VISUAL-E-001',
  source_world_fingerprint: 'source-world:turnstile-photo:47x40',
  temporal_gate: { kind: 'after-event', state: 'satisfied', trigger: 'user physically passes the turnstile' },
  release_condition: 'post-transition world preserves source camera/geometry/light and contains Monday naturally',
  evidence: ['transition observed'],
});

assert.throws(() => admitVisualActuator({
  graph,
  route: null,
  visual_event: afterTransition,
  action,
}), /VISUAL_ACTUATOR_BYPASS_BLOCKED/);

assert.throws(() => admitVisualActuator({
  graph,
  route,
  visual_event: afterTransition,
  action: { ...action, verification_plan: ['render-readback'] },
}), /VISUAL_VERIFICATION_PLAN_INCOMPLETE/);

const routed = governedVisualAct({
  graph,
  route,
  visual_event: afterTransition,
  action,
  execute: () => { executions += 1; return 'rendered'; },
});
assert.equal(routed.admission.decision, 'ROUTE');
assert.equal(routed.result, 'rendered');
assert.equal(executions, 1);

const failureGene = compilePrematureVisualFailureGene({
  event_id: 'VISUAL-E-001',
  evidence: ['renderer invoked while temporal gate was pending'],
});
assert.equal(failureGene.failure_class, 'FAIL_VISUAL_PREMATURE_ACTUATION');
assert.equal(failureGene.invariant, 'NO_DIRECT_EVENT_TO_ACTION');
assert.equal(failureGene.mutation_required_before_retry, true);

console.log(JSON.stringify({
  status: 'PASS',
  proved: [
    'future/conditional visual events HOLD before the transition',
    'HOLD never executes the renderer',
    'satisfied temporal gate still cannot bypass a route receipt',
    'visual verification must include temporal and source-world checks',
    'complete post-transition route admits exactly one renderer execution',
    'premature visual actuation compiles into a reusable failure gene',
  ],
}, null, 2));
