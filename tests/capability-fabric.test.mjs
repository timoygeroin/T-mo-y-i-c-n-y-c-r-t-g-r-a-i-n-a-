import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const system=JSON.parse(await readFile(new URL('../SYSTEM.json',import.meta.url),'utf8'));

test('platform mode is not MondayID capability owner',()=>{
  assert.equal(system.capability_fabric.owner,'mondayid_not_platform');
  assert.ok(system.meta_invariants.includes('platform_mode_is_not_capability_owner'));
});

test('owned capability fabric precedes platform mode',()=>{
  assert.deepEqual(system.capability_fabric.routing_order,[
    'RECOVER','REDISCOVER','REUSE','COMPOSE','PATCH','BUILD','DELEGATE','PLATFORM_SUBSTRATE','HUMAN_GATE'
  ]);
  assert.ok(system.current_policies.includes('owned_capability_fabric_precedes_platform_mode'));
});

test('Monday Work is host-neutral and long work does not default to provider Work',()=>{
  assert.ok(system.capability_fabric.monday_owned_modes.includes('MONDAY_WORK'));
  assert.ok(system.capability_fabric.integrated_mechanisms.includes('resumable_workless_runtime'));
  assert.ok(system.capability_fabric.anti_regressions.includes('do_not_default_to_chatgpt_work_for_long_tasks'));
});

test('one pass traverses remaining reachable routes',()=>{
  assert.match(system.capability_fabric.one_pass,/all_reachable_orthogonal_routes/);
});
