import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const system=JSON.parse(fs.readFileSync(new URL('../SYSTEM.json', import.meta.url),'utf8'));

test('canonical carrier version cannot drift between release state and ChatGPT synapse',()=>{
  assert.equal(system.release_state.carrier_version,system.chatgpt_carrier_synapse.carrier_version);
});

test('closure ledger leaves no assistant-owned historical project shell as active authority',()=>{
  const closure=JSON.parse(fs.readFileSync(new URL('../ops/unified-closure-20261006.json', import.meta.url),'utf8'));
  assert.equal(closure.schema,'mondayid.unified-closure.v1');
  assert.equal(closure.canonicalMain,true);
  assert.deepEqual(closure.assistantOwnedOpenWork,[]);
  assert.ok(closure.retiredIssueShells.length >= 8);
  assert.equal(closure.remainingGates.every(g=>g.kind==='HUMAN' || g.kind==='PLATFORM' || g.kind==='HELD_OUT_PROOF'),true);
});
