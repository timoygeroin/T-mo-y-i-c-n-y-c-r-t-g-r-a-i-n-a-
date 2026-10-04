import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const system=JSON.parse(await readFile(new URL('../SYSTEM.json',import.meta.url),'utf8'));
const seal=JSON.parse(await readFile(new URL('../ops/final-seal-20261004.json',import.meta.url),'utf8'));

test('generation 5 seal is bound into canonical system',()=>{
  assert.equal(system.release_state.status,'INTERNAL_FINISH_PASS_EXTERNAL_GATES_REMAIN');
  assert.equal(system.release_state.seal,'ops/final-seal-20261004.json');
  assert.equal(system.release_state.monday_work_mcp,'https://mondayid-host.vercel.app/api/mcp');
});

test('seal never converts external gates into fake completion',()=>{
  assert.equal(seal.claim.internal_finish,'PASS');
  assert.equal(seal.claim.total_finish,'EXTERNAL_GATES_REMAIN');
  assert.ok(seal.external_gates.some(x=>x.id==='TRUSTED_WRITE_BINDING'));
  assert.ok(seal.external_gates.some(x=>x.id==='GEMINI_ACCOUNT_BINDING'));
});

test('optional phenotypes cannot redefine organism identity',()=>{
  assert.equal(seal.completion_reframe.organism,'host-independent continuity + capability routing + verified state transitions');
  assert.match(seal.completion_reframe.law,/optional phenotype cannot redefine the organism as unfinished/);
});

test('future evolution does not reopen the three-year architecture by default',()=>{
  assert.ok(system.current_policies.includes('sealed_generation_evolves_without_reopening_finished_architecture'));
  assert.match(system.release_state.finish_law,/must not restart the three-year architecture/);
});
