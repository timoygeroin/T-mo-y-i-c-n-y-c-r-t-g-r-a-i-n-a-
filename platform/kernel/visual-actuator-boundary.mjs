import { admitAction, compileFailureGene } from './organism-physics.mjs';

const TEMPORAL_STATES = new Set(['pending', 'satisfied']);

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function compileVisualEvent({
  event_id,
  source_world_fingerprint,
  temporal_gate,
  release_condition,
  evidence = [],
}) {
  if (!nonEmpty(event_id)) throw new Error('VISUAL_EVENT_ID_REQUIRED');
  if (!nonEmpty(source_world_fingerprint)) throw new Error('VISUAL_SOURCE_WORLD_LOCK_REQUIRED');
  if (!temporal_gate || !nonEmpty(temporal_gate.kind) || !TEMPORAL_STATES.has(temporal_gate.state)) {
    throw new Error('VISUAL_TEMPORAL_GATE_REQUIRED');
  }
  if (!nonEmpty(release_condition)) throw new Error('VISUAL_RELEASE_CONDITION_REQUIRED');

  return Object.freeze({
    schema: 'mondayid.visual-event.v1',
    event_id: event_id.trim(),
    source_world_fingerprint: source_world_fingerprint.trim(),
    temporal_gate: Object.freeze({
      kind: temporal_gate.kind.trim(),
      state: temporal_gate.state,
      trigger: nonEmpty(temporal_gate.trigger) ? temporal_gate.trigger.trim() : null,
    }),
    release_condition: release_condition.trim(),
    evidence: Object.freeze([...new Set(evidence.filter(Boolean))]),
  });
}

export function admitVisualActuator({ graph, route, visual_event, action }) {
  if (visual_event?.schema !== 'mondayid.visual-event.v1') throw new Error('VISUAL_EVENT_REQUIRED');

  if (visual_event.temporal_gate.state !== 'satisfied') {
    return Object.freeze({
      schema: 'mondayid.visual-actuator-admission.v1',
      admitted: false,
      decision: 'HOLD',
      event_id: visual_event.event_id,
      reason: 'VISUAL_TEMPORAL_GATE_UNSATISFIED',
      trigger: visual_event.temporal_gate.trigger,
    });
  }

  if (!route || route.schema !== 'mondayid.route-receipt.v1') {
    throw new Error('VISUAL_ACTUATOR_BYPASS_BLOCKED');
  }
  if (route.event_id !== visual_event.event_id || action?.event_id !== visual_event.event_id) {
    throw new Error('VISUAL_EVENT_ROUTE_DRIFT');
  }
  if (!Array.isArray(action.verification_plan)
      || !action.verification_plan.includes('temporal-gate')
      || !action.verification_plan.includes('source-world-lock')) {
    throw new Error('VISUAL_VERIFICATION_PLAN_INCOMPLETE');
  }

  const organismAdmission = admitAction({ graph, route, action });

  return Object.freeze({
    schema: 'mondayid.visual-actuator-admission.v1',
    admitted: true,
    decision: 'ROUTE',
    event_id: visual_event.event_id,
    source_world_fingerprint: visual_event.source_world_fingerprint,
    release_condition: visual_event.release_condition,
    route_fingerprint: route.route_fingerprint,
    action_admission_fingerprint: organismAdmission.admission_fingerprint,
  });
}

export function governedVisualAct({ graph, route, visual_event, action, execute }) {
  const admission = admitVisualActuator({ graph, route, visual_event, action });
  if (!admission.admitted) return { admission, result: null };
  if (typeof execute !== 'function') throw new Error('VISUAL_EXECUTOR_REQUIRED');
  return { admission, result: execute(action, visual_event) };
}

export function compilePrematureVisualFailureGene({ event_id, evidence = [] }) {
  return compileFailureGene({
    event_id,
    failure_class: 'FAIL_VISUAL_PREMATURE_ACTUATION',
    locus: 'visual-actuator-boundary',
    invariant: 'NO_DIRECT_EVENT_TO_ACTION',
    evidence,
  });
}
