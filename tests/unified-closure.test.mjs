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


test('legacy Monday Work surface is a compatibility organ, not a second identity',()=>{
  const work=JSON.parse(fs.readFileSync(new URL('../plugins/monday-work/plugin.json', import.meta.url),'utf8'));
  const closure=JSON.parse(fs.readFileSync(new URL('../ops/unified-closure-20261006.json', import.meta.url),'utf8'));
  assert.equal(work.version,'1.3.0');
  assert.match(work.description,/compatibility execution organ/i);
  assert.equal(closure.compatibilityOrgans.mondayWork.pluginId,'plugins_6ac2797393ac8191b3eba1877b99c293');
  assert.equal(closure.compatibilityOrgans.mondayWork.version,'1.3.0');
  assert.equal(closure.compatibilityOrgans.mondayWork.identityOwner,false);
});

test('gpt-root open PR shells are retired as donor provenance',()=>{
  const closure=JSON.parse(fs.readFileSync(new URL('../ops/unified-closure-20261006.json', import.meta.url),'utf8'));
  const prs=closure.retiredExternalShells.filter(x=>x.repository==='timoygeroin/gpt-root').map(x=>x.pullRequest).sort((a,b)=>a-b);
  assert.deepEqual(prs,[1,5,6]);
});
