import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const audit=JSON.parse(fs.readFileSync(new URL('../ops/one-pass-readback-20261021.json',import.meta.url),'utf8'));

test('release evidence carries exact merged SHAs and full CI receipts',()=>{
  assert.equal(audit.schema,'mondayid.execution-readback.v1');
  assert.deepEqual(audit.delivered.map(x=>x.pr),[151,152,153]);
  assert.ok(audit.delivered.every(x=>/^[0-9a-f]{40}$/.test(x.mainSha)));
  assert.ok(audit.delivered.every(x=>x.tests.passed>0 && x.tests.failed===0 && Number.isInteger(x.ciRun)));
  assert.equal(audit.production_readback.sha,audit.delivered.at(-1).mainSha);
  assert.equal(audit.production_readback.state,'READY');
});

test('no final seal is manufactured while material live gates are unresolved',()=>{
  assert.equal(audit.status,'PARTIAL_COMPLETION_EXTERNAL_GATES_REMAIN');
  for(const id of ['OAUTH_OWNER_BINDING','HOST_BOUND_BUS_AUTH','CLEAN_HOST_WORLDLINE_TRANSFER','HISTORICAL_CAUSAL_CORPUS','PHYSICAL_IPHONE_CONSUMER','GROK_GEMINI_INHERITANCE']){
    const gate=audit.active_gates.find(x=>x.id===id);
    assert.ok(gate, 'missing gate '+id);
    assert.notEqual(gate.status,'VERIFIED');
  }
  assert.equal(audit.active_gates.find(x=>x.id==='LIVE_PAID_MODEL_API').status,'OPTIONAL_DISABLED');
  assert.match(audit.releaseRule,/independently observed evidence/i);
});

test('historical Drive archive cannot be marked migrated into a public repo',()=>{
  const gate=audit.active_gates.find(x=>x.id==='HISTORICAL_CAUSAL_CORPUS');
  assert.equal(gate.status,'PARTIAL_UNVERIFIED');
  assert.match(gate.constraint,/never merge private raw Drive/i);
});
