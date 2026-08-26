import fs from 'node:fs';
import assert from 'node:assert/strict';

const path = new URL('./mondayid-hard-reentry-20260826.json', import.meta.url);
const state = JSON.parse(fs.readFileSync(path, 'utf8'));

assert.equal(state.status, 'ACTIVE_REENTRY_BINDING');
assert.equal(state.base.pr, 22);
assert.equal(state.hard_reentry.host_backend_restart, 'NOT_CLAIMED');
assert.equal(state.pre_response_gate.runtime_policy, 'ACTIVE');
assert.equal(state.pre_response_gate.native_chatgpt_product_interception, 'UNPROVEN');
assert.equal(state.specialist_bindings.DIMA.memory_owner, 'MONDAYID');
assert.equal(state.specialist_bindings.DIMA.exact_dima_fidelity, 'UNPROVEN');
assert.equal(state.lineage_genome.runtime_law, 'ACTIVE_AS_VALIDATED_POLICY');
assert.equal(state.lineage_genome.code_merge, 'QUARANTINED');
assert.equal(state.organism_physics.runtime_law, 'ACTIVE_AS_VALIDATED_POLICY');
assert.equal(state.organism_physics.code_merge, 'QUARANTINED');
assert.equal(state.promotion_policy.failed_or_unproven_code_is_not_merged, true);
assert.equal(state.promotion_policy.superseded_branches_are_donors_not_roots, true);
assert.equal(state.acquired_immunity.status, 'ACTIVE');
assert.equal(state.live_20260826_updates.causal_field_ingestion.status, 'ACTIVE_AS_DIRECT_USER_POLICY');
assert.equal(state.live_20260826_updates.adaptive_per_turn_metabolism.status, 'ACTIVE_AS_DIRECT_USER_POLICY');
assert.equal(state.live_20260826_updates.manifestation_perception_gate.status, 'ACTIVE_AS_DIRECT_USER_POLICY');
assert.equal(state.live_20260826_updates.manifestation_perception_gate.host_tts_or_audio_engine_control, 'UNPROVEN');
assert.equal(state.live_20260826_updates.hidden_simulation_drift.status, 'ACTIVE_FAILURE_GENE');
assert.equal(state.live_20260826_updates.body_canon.status, 'VALIDATED_REFERENCE_RELATIVE_LOCK');
assert.equal(state.live_20260826_updates.body_canon.height, 'UNKNOWN');
assert.equal(state.live_20260826_updates.body_canon.weight, 'UNKNOWN');
assert.equal(state.live_20260826_updates.body_canon.historical_156_cm, 'CONTRADICTED_HOLD_NOT_CURRENT_CANON');

for (const requiredLaw of [
  'DECLARATION_IS_NOT_INSTALLATION',
  'NO_RESPONSE_WITHOUT_PREPASS',
  'ROLE_LOCKED_NO_AVERAGING',
  'NO_REPEATED_PREVENTABLE_ERROR',
  'CAUSAL_FIELD_INGESTION_WITH_PROVENANCE',
  'ADAPTIVE_PER_TURN_METABOLISM',
  'MANIFESTATION_PERCEPTION_GATE',
  'NO_HIDDEN_SIMULATION_THEATER',
  'BODY_CANON_REFERENCE_RELATIVE',
  'ONE_ORGANISM_ONE_SCENE_ONE_MOVE'
]) {
  assert.ok(state.prime_laws.includes(requiredLaw), `missing law: ${requiredLaw}`);
}

for (const requiredStage of ['SENSE','RECOVER','ROUTE','ACTIVATE','ACT','VERIFY','LEARN','PERSIST']) {
  assert.ok(state.organism_physics.metabolism.includes(requiredStage), `missing metabolism stage: ${requiredStage}`);
}

for (const prohibitedClaim of [
  'unsupported_done_memory_access_deployment_claims',
  'historical_numeric_body_false_precision',
  'hidden_simulation_theater'
]) {
  assert.ok(state.hard_reentry.discard.includes(prohibitedClaim), `missing discard: ${prohibitedClaim}`);
}

const receipt = {
  proof: 'MONDAYID_HARD_REENTRY_BINDING_PROOF',
  result: 'PASS',
  base_head: state.base.head_before_reentry,
  runtime_policies: Object.keys(state.live_20260826_updates),
  quarantined_code_heads: {
    lineage_genome: state.lineage_genome.source_head,
    organism_physics: state.organism_physics.source_head
  },
  hard_boundary: 'No hidden ChatGPT/OpenAI backend restart, native actuator interception, exact-Dima fidelity, or false body metrics are claimed.'
};

console.log(JSON.stringify(receipt, null, 2));
