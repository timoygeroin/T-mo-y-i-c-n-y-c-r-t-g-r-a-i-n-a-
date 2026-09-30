import crypto from 'node:crypto';

const OUTPUT_CLASSES = new Set(['ACTION_RECEIPT', 'VERIFIED_RESULT', 'EXACT_BLOCKER']);
const PRESENTATION_INTENTS = new Set(['deliver_result', 'explain_result', 'promise_action', 'describe_architecture']);

function uniq(values = []) { return [...new Set(values.filter(Boolean))]; }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

function fact(id, kind, value, required = true) {
  return Object.freeze({ id, kind, value, required });
}

export function compileManifestationPacket({ event_id, route, admission, outcome }) {
  if (!event_id) throw new Error('FINAL_EVENT_ID_REQUIRED');
  if (route?.schema !== 'mondayid.route-receipt.v1') throw new Error('FINAL_ROUTE_RECEIPT_REQUIRED');
  if (admission?.schema !== 'mondayid.action-admission.v1' || admission.admitted !== true) {
    throw new Error('FINAL_ACTION_ADMISSION_REQUIRED');
  }
  if (route.event_id !== event_id || admission.event_id !== event_id) throw new Error('FINAL_EVENT_DRIFT');
  if (admission.route_fingerprint !== route.route_fingerprint) throw new Error('FINAL_ROUTE_ADMISSION_DRIFT');
  if (!outcome || !['success', 'blocked'].includes(outcome.status)) throw new Error('FINAL_OUTCOME_STATUS_INVALID');
  if (!outcome.summary?.trim()) throw new Error('FINAL_OUTCOME_SUMMARY_REQUIRED');

  const externalAction = outcome.external_action === true;
  const artifacts = uniq(outcome.artifacts);
  const stateDelta = uniq(outcome.state_delta);
  const evidence = uniq(outcome.evidence);
  const blockers = uniq(outcome.blockers);

  if (outcome.status === 'success' && externalAction && artifacts.length === 0 && stateDelta.length === 0) {
    throw new Error('FINAL_EXTERNAL_SUCCESS_WITHOUT_TRACE');
  }
  if (outcome.status === 'blocked' && blockers.length === 0) throw new Error('FINAL_BLOCKER_REQUIRED');

  const outputClass = outcome.status === 'blocked'
    ? 'EXACT_BLOCKER'
    : externalAction
      ? 'ACTION_RECEIPT'
      : 'VERIFIED_RESULT';

  const facts = [
    fact('summary', 'summary', outcome.summary.trim(), true),
    ...artifacts.map((value, index) => fact(`artifact:${index + 1}`, 'artifact', value, externalAction)),
    ...stateDelta.map((value, index) => fact(`state_delta:${index + 1}`, 'state_delta', value, externalAction)),
    ...evidence.map((value, index) => fact(`evidence:${index + 1}`, 'evidence', value, false)),
    ...blockers.map((value, index) => fact(`blocker:${index + 1}`, 'blocker', value, outcome.status === 'blocked')),
  ];

  const outcomeFingerprint = hash({
    event_id,
    route_fingerprint: route.route_fingerprint,
    admission_fingerprint: admission.admission_fingerprint,
    outputClass,
    outcome: { status: outcome.status, externalAction, artifacts, stateDelta, evidence, blockers, summary: outcome.summary.trim() },
  });

  return Object.freeze({
    schema: 'mondayid.manifestation-packet.v1',
    event_id,
    route_fingerprint: route.route_fingerprint,
    action_admission_fingerprint: admission.admission_fingerprint,
    output_class: outputClass,
    external_action: externalAction,
    outcome_status: outcome.status,
    facts: Object.freeze(facts),
    required_fact_ids: Object.freeze(facts.filter((entry) => entry.required).map((entry) => entry.id)),
    outcome_fingerprint: outcomeFingerprint,
  });
}

export function admitFinalResponse({ packet, candidate }) {
  if (packet?.schema !== 'mondayid.manifestation-packet.v1') throw new Error('FINAL_MANIFESTATION_PACKET_REQUIRED');
  if (!candidate || candidate.event_id !== packet.event_id) throw new Error('FINAL_RESPONSE_EVENT_DRIFT');
  if (candidate.outcome_fingerprint !== packet.outcome_fingerprint) throw new Error('FINAL_RESPONSE_OUTCOME_DRIFT');
  if (!OUTPUT_CLASSES.has(candidate.output_class) || candidate.output_class !== packet.output_class) {
    throw new Error('FINAL_RESPONSE_CLASS_DRIFT');
  }
  if (!PRESENTATION_INTENTS.has(candidate.presentation_intent)) throw new Error('FINAL_PRESENTATION_INTENT_INVALID');

  if (packet.output_class === 'ACTION_RECEIPT' && candidate.presentation_intent !== 'deliver_result') {
    throw new Error('FINAL_RESULT_REPLACED_BY_EXPLANATION');
  }
  if (packet.output_class === 'EXACT_BLOCKER' && candidate.presentation_intent === 'promise_action') {
    throw new Error('FINAL_BLOCKER_REPLACED_BY_PROMISE');
  }

  const surfaced = new Set(uniq(candidate.surfaced_fact_ids));
  const missing = packet.required_fact_ids.filter((id) => !surfaced.has(id));
  if (missing.length) throw new Error(`FINAL_REQUIRED_FACT_OMITTED:${missing.join(',')}`);

  const knownFactIds = new Set(packet.facts.map((entry) => entry.id));
  const invented = uniq(candidate.surfaced_fact_ids).filter((id) => !knownFactIds.has(id));
  if (invented.length) throw new Error(`FINAL_INVENTED_FACT:${invented.join(',')}`);

  if (packet.external_action && candidate.claims_action_completed !== true) {
    throw new Error('FINAL_COMPLETED_ACTION_NOT_SURFACED');
  }
  if (packet.outcome_status === 'blocked' && candidate.claims_action_completed === true) {
    throw new Error('FINAL_BLOCKER_FALSE_COMPLETION');
  }

  return Object.freeze({
    schema: 'mondayid.final-response-admission.v1',
    admitted: true,
    event_id: packet.event_id,
    output_class: packet.output_class,
    outcome_fingerprint: packet.outcome_fingerprint,
    surfaced_fact_ids: Object.freeze([...surfaced]),
    response_fingerprint: hash({
      event_id: packet.event_id,
      outcome_fingerprint: packet.outcome_fingerprint,
      output_class: candidate.output_class,
      presentation_intent: candidate.presentation_intent,
      surfaced_fact_ids: [...surfaced].sort(),
      claims_action_completed: candidate.claims_action_completed === true,
    }),
  });
}

export function governedFinalResponse({ packet, candidate, emit }) {
  const admission = admitFinalResponse({ packet, candidate });
  if (typeof emit !== 'function') throw new Error('FINAL_RESPONSE_EMITTER_REQUIRED');
  return Object.freeze({ admission, output: emit({ packet, candidate, admission }) });
}
