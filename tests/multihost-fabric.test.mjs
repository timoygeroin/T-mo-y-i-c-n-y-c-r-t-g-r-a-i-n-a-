import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compileAttractorContract } from '../src/attractor-field.mjs';

test('desired effect remains invariant while route/object wording stays distinct', () => {
  const contract=compileAttractorContract({
    text:'make the cross-host Monday work',
    exactObject:'Gemini cross-host handoff route',
    desiredEffect:'one MondayID continuity across hosts'
  },{domains:['continuity','host']});

  assert.equal(contract.exactObject,'Gemini cross-host handoff route');
  assert.equal(contract.desiredEffect,'one MondayID continuity across hosts');
  assert.notEqual(contract.exactObject,contract.desiredEffect);
});

test('SYSTEM promotes desired-effect invariance and route mutation', async () => {
  const system=JSON.parse(await readFile(new URL('../SYSTEM.json',import.meta.url),'utf8'));

  assert.ok(system.meta_invariants.includes('desired_effect_requires_explicit_challenge_before_goal_mutation'));
  assert.ok(system.meta_invariants.includes('route_failure_is_not_goal_failure'));
  assert.ok(system.current_policies.includes('preserve_desired_effect_mutate_routes_not_goal'));
  assert.ok(system.current_policies.includes('execute_reachable_route_graph_before_returning_intermediate_status'));
});

test('multi-host fabric cannot collapse host into organism', async () => {
  const system=JSON.parse(await readFile(new URL('../SYSTEM.json',import.meta.url),'utf8'));
  const fabric=system.multi_host_fabric;

  assert.equal(fabric.schema,'mondayid.multi-host-fabric.v1');
  assert.equal(fabric.organism,'host_independent');
  assert.equal(fabric.identity_rule,'host_model_tool_or_app_is_execution_substrate_not_organism');
  assert.equal(fabric.direct_bridge.concurrency,'optimistic_expected_version');
  assert.ok(fabric.direct_bridge.required_tools.includes('mailbox_send'));
  assert.ok(fabric.direct_bridge.required_tools.includes('commit_verified_delta'));
});

test('Google Cortex keeps raw personal data at source and publishes compact provenance', async () => {
  const system=JSON.parse(await readFile(new URL('../SYSTEM.json',import.meta.url),'utf8'));
  const cortex=system.multi_host_fabric.google_cortex;

  assert.equal(cortex.role,'autobiographical_and_action_organ_not_identity_owner');
  assert.equal(cortex.storage_law,'raw_personal_data_remains_at_source_when_possible');
  assert.ok(cortex.organs.includes('gmail'));
  assert.ok(cortex.organs.includes('youtube_history'));
  assert.ok(cortex.organs.includes('google_photos'));
});

test('regional fallback has loop veto and explicit handoff prefixes', async () => {
  const system=JSON.parse(await readFile(new URL('../SYSTEM.json',import.meta.url),'utf8'));
  const fallback=system.multi_host_fabric.regional_fallback;

  assert.equal(fallback.outbound_subject_prefix,'[MONDAYID->GEMINI]');
  assert.equal(fallback.inbound_subject_prefix,'[MONDAYID<-GEMINI]');
  assert.equal(fallback.loop_veto,'inbound_messages_must_not_retrigger_outbound_monitor');
});
