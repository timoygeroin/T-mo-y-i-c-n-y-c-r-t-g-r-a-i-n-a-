import test from 'node:test';
import assert from 'node:assert/strict';
import { describeHost, bootHost } from '../src/host-adapter.mjs';

const snapshot = {
  schema:'mondayid.worldline.snapshot.v0.4.0',
  trust:'AUTHENTICATED_MACHINE_WRITER',
  readOnly:true,
  generatedAtIso:'2026-09-22T00:00:00Z',
  events:[],
  conflictProbe:{event:null,conflicts:[]}
};

const fetchImpl=async()=>({ok:true,status:200,json:async()=>snapshot});

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

test('host boot recovers trusted worldline and fulfills only the concrete host proof', async () => {
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
  assert.equal(out.surface.state,'VERIFIED');
});

test('host boot cannot turn arbitrary work into a verified result', async () => {
  const out=await bootHost({
    env:{MONDAYID_WORLDLINE_URL:'https://worldline.test'},
    fetchImpl,
    signal:{id:'arbitrary',text:'complete real work',effect:'complete real work'}
  });
  assert.equal(out.ok,false);
  assert.equal(out.state,'BLOCKED');
  assert.equal(out.reason,'NO_SEMANTIC_PROGRESS');
  assert.equal(out.surface.state,'EXECUTION');
  assert.equal(out.surface.message.includes('VERIFIED'),false);
});

test('host proof receptor rejects a host-shaped effect it cannot actually prove', async () => {
  const out=await bootHost({
    env:{MONDAYID_WORLDLINE_URL:'https://worldline.test'},
    fetchImpl,
    signal:{id:'unsupported-host',text:'finish host deployment',effect:'deploy the requested application'}
  });
  assert.equal(out.ok,false);
  assert.equal(out.state,'BLOCKED');
  assert.equal(out.pass.state,'BLOCKED');
  assert.ok(out.pass.cycles >= 1);
  assert.equal(out.surface.state,'EXECUTION');
});
