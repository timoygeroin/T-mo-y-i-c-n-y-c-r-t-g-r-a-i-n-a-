import assert from 'node:assert/strict';
import { compileResidentGraph, routeEvent, admitAction } from './organism-physics.mjs';
import { compileManifestationPacket, admitFinalResponse, governedFinalResponse } from './final-response-boundary.mjs';

const graph = compileResidentGraph({
  graph_id: 'MONDAYID-FINAL-BOUNDARY-GRAPH-001',
  nodes: [
    { id: 'sentinel', kind: 'sentinel', resident: true, provides: ['preflight'], verifies: ['route-integrity'], writes_to: ['continuity'] },
    { id: 'manifestation-integrity', kind: 'verifier', resident: true, provides: ['final-integrity'], awakens_on: ['final-response'], requires: ['sentinel'], verifies: ['outcome-binding', 'fact-preservation'], writes_to: ['response-receipts'], cost: 1 },
    { id: 'final-emitter', kind: 'tool', resident: true, provides: ['response-emit'], awakens_on: ['final-response'], requires: ['manifestation-integrity'], cost: 2 },
  ],
  edges: [
    { from: 'sentinel', to: 'manifestation-integrity', relation: 'awakens' },
    { from: 'manifestation-integrity', to: 'final-emitter', relation: 'admits' },
  ],
});

const route = routeEvent(graph, {
  event_id: 'FINAL-E-001',
  tags: ['final-response', 'external-action'],
  required_capabilities: ['final-integrity', 'response-emit'],
});

const action = {
  event_id: 'FINAL-E-001',
  actuator: 'final-emitter',
  verification_plan: ['outcome-binding', 'fact-preservation'],
  writeback_plan: ['response-receipts'],
};
const actionAdmission = admitAction({ graph, route, action });

const packet = compileManifestationPacket({
  event_id: 'FINAL-E-001',
  route,
  admission: actionAdmission,
  outcome: {
    status: 'success',
    external_action: true,
    summary: 'Final-response boundary was embodied and committed.',
    artifacts: ['commit:107975f53e9934fa13c0bc16ecdf4a7828be90d5'],
    state_delta: ['final responses are now fingerprint-bound to verified outcomes on this branch'],
    evidence: ['organism-physics route receipt', 'action admission receipt'],
  },
});

const required = packet.required_fact_ids;

assert.throws(() => admitFinalResponse({
  packet,
  candidate: {
    event_id: 'FINAL-E-001',
    outcome_fingerprint: packet.outcome_fingerprint,
    output_class: 'ACTION_RECEIPT',
    presentation_intent: 'describe_architecture',
    surfaced_fact_ids: required,
    claims_action_completed: true,
  },
}), /FINAL_RESULT_REPLACED_BY_EXPLANATION/);

assert.throws(() => admitFinalResponse({
  packet,
  candidate: {
    event_id: 'FINAL-E-001',
    outcome_fingerprint: 'stale-or-different-outcome',
    output_class: 'ACTION_RECEIPT',
    presentation_intent: 'deliver_result',
    surfaced_fact_ids: required,
    claims_action_completed: true,
  },
}), /FINAL_RESPONSE_OUTCOME_DRIFT/);

assert.throws(() => admitFinalResponse({
  packet,
  candidate: {
    event_id: 'FINAL-E-001',
    outcome_fingerprint: packet.outcome_fingerprint,
    output_class: 'ACTION_RECEIPT',
    presentation_intent: 'deliver_result',
    surfaced_fact_ids: ['summary'],
    claims_action_completed: true,
  },
}), /FINAL_REQUIRED_FACT_OMITTED/);

assert.throws(() => admitFinalResponse({
  packet,
  candidate: {
    event_id: 'FINAL-E-001',
    outcome_fingerprint: packet.outcome_fingerprint,
    output_class: 'ACTION_RECEIPT',
    presentation_intent: 'deliver_result',
    surfaced_fact_ids: [...required, 'invented:magic-state'],
    claims_action_completed: true,
  },
}), /FINAL_INVENTED_FACT/);

assert.throws(() => admitFinalResponse({
  packet,
  candidate: {
    event_id: 'FINAL-E-001',
    outcome_fingerprint: packet.outcome_fingerprint,
    output_class: 'ACTION_RECEIPT',
    presentation_intent: 'deliver_result',
    surfaced_fact_ids: required,
    claims_action_completed: false,
  },
}), /FINAL_COMPLETED_ACTION_NOT_SURFACED/);

let emitted = 0;
const governed = governedFinalResponse({
  packet,
  candidate: {
    event_id: 'FINAL-E-001',
    outcome_fingerprint: packet.outcome_fingerprint,
    output_class: 'ACTION_RECEIPT',
    presentation_intent: 'deliver_result',
    surfaced_fact_ids: required,
    claims_action_completed: true,
  },
  emit: ({ packet: boundPacket }) => {
    emitted += 1;
    return {
      status: 'delivered',
      summary: boundPacket.facts.find((entry) => entry.id === 'summary').value,
    };
  },
});

assert.equal(emitted, 1);
assert.equal(governed.admission.admitted, true);
assert.equal(governed.admission.output_class, 'ACTION_RECEIPT');

const blockerPacket = compileManifestationPacket({
  event_id: 'FINAL-E-001',
  route,
  admission: actionAdmission,
  outcome: {
    status: 'blocked',
    external_action: false,
    summary: 'External action is blocked by missing authority.',
    blockers: ['missing external mutation authority'],
    evidence: ['capability readback'],
  },
});

assert.throws(() => admitFinalResponse({
  packet: blockerPacket,
  candidate: {
    event_id: 'FINAL-E-001',
    outcome_fingerprint: blockerPacket.outcome_fingerprint,
    output_class: 'EXACT_BLOCKER',
    presentation_intent: 'promise_action',
    surfaced_fact_ids: blockerPacket.required_fact_ids,
    claims_action_completed: false,
  },
}), /FINAL_BLOCKER_REPLACED_BY_PROMISE/);

console.log(JSON.stringify({
  status: 'PASS',
  graph_fingerprint: graph.fingerprint,
  route_fingerprint: route.route_fingerprint,
  outcome_fingerprint: packet.outcome_fingerprint,
  response_fingerprint: governed.admission.response_fingerprint,
  proved: [
    'completed action cannot be manifested as architecture commentary',
    'final response is bound to the exact verified outcome fingerprint',
    'required artifacts and state deltas cannot disappear at presentation time',
    'invented state cannot enter the final response packet',
    'completed external actions must surface as completed',
    'exact blockers cannot be converted into promises',
    'final emitter runs only after manifestation integrity admission',
  ],
}, null, 2));
