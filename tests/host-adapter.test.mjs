import test from 'node:test';
import assert from 'node:assert/strict';
import { describeHost, bootHost } from '../src/host-adapter.mjs';

test('host identity proves generation 5 and no legacy runtime dependency', () => {
  const out = describeHost({ env:{} });
  assert.equal(out.ok,true);
  assert.equal(out.generation,5);
  assert.equal(out.rewrite,true);
  assert.equal(out.runtime_dependency_on_legacy,false);
  assert.equal(out.kernel,'mondayid-generation-5');
  assert.equal(out.authority.no_spend,true);
});

test('host boot fails closed when trusted worldline is missing', async () => {
  const out = await bootHost({ env:{} });
  assert.equal(out.ok,false);
  assert.equal(out.code,'WORLDLINE_URL_MISSING');
  assert.equal(out.status,503);
});

test('host boot recovers trusted worldline and fulfills one pass', async () => {
  const snapshot={
    schema:'mondayid.worldline.snapshot.v0.4.0',
    trust:'AUTHENTICATED_MACHINE_WRITER',
    readOnly:true,
    generatedAtIso:'2026-09-22T00:00:00Z',
    events:[],
    conflictProbe:{event:null,conflicts:[]}
  };
  const fetchImpl=async()=>({ok:true,status:200,json:async()=>snapshot});
  const out=await bootHost({
    env:{MONDAYID_WORLDLINE_URL:'https://worldline.test'},
    fetchImpl
  });
  assert.equal(out.ok,true);
  assert.equal(out.identity.generation,5);
  assert.equal(out.worldline.trust,'trusted');
  assert.equal(out.worldline.schema,'mondayid.worldline.snapshot.v0.4.0');
  assert.equal(out.pass.state,'FULFILLED');
  assert.equal(out.pass.reason,'ALL_INTENTS_FULFILLED');
});
