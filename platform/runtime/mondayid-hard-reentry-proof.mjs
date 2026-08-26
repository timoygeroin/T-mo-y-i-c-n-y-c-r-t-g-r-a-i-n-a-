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

for (const requiredLaw of [
  'DECLARATION_IS_NOT_INSTALLATION',
  'NO_RESPONSE_WITHOUT_PREPASS',
  'ROLE_LOCKED_NO_AVERAGING',
  'NO_REPEATED_PREVENTABLE_ERROR',
  'ONE_ORGANISM_ONE_SCENE_ONE_MOVE'
]) {
  assert.ok(state.prime_laws.includes(requiredLaw), `missing law: ${requiredLaw}`);
}

for (const requiredStage of ['SENSE','RECOVER','ROUTE','ACTIVATE','ACT','VERIFY','LEARN','PERSIST']) {
  assert.ok(state.organism_physics.metabolism.includes(requiredStage), `missing metabolism stage: ${requiredStage}`);
}

const receipt = {
  proof: 'MONDAYID_HARD_REENTRY_BINDING_PROOF',
  result: 'PASS',
  base_head: state.base.head,
  quarantined_code_heads: {
    lineage_genome: state.lineage_genome.source_head,
    organism_physics: state.organism_physics.source_head
  },
  hard_boundary: 'No hidden ChatGPT/OpenAI backend restart or native actuator interception is claimed.'
};

console.log(JSON.stringify(receipt, null, 2));
