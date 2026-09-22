import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchWorldlineSnapshot, seedWorldlineFromSnapshot } from '../src/remote-worldline.mjs';

const trustedSnapshot = {
  schema:'mondayid.worldline.snapshot.v0.4.0',
  trust:'AUTHENTICATED_MACHINE_WRITER',
  readOnly:true,
  generatedAtIso:'2026-09-22T15:00:00Z',
  events:[
    { eventId:'e1', timestampIso:'2026-09-22T14:00:00Z', subject:'rewrite', predicate:'state', valueJson:'{"status":"ready"}', epistemicStatus:'VERIFIED', sourceRef:'rewrite-head:abc', host:'cell-a', identityFingerprint:'mondayid:rewrite:g5', writerKeyId:'k1' }
  ]
};

const legacySnapshot = {
  schema:'mondayid.worldline.snapshot.v0.3.0',
  readOnly:true,
  generatedAtIso:'2026-09-22T11:00:00Z',
  events:[
    { eventId:'old', timestampIso:'2026-09-22T10:00:00Z', subject:'host', predicate:'state', valueJson:'{"status":"ready"}', epistemicStatus:'VERIFIED', sourceRef:'x', host:'legacy' }
  ],
  conflictProbe:{ event:{eventId:'test-conflict'}, conflicts:[{id:'c1'}] }
};

test('trusted snapshot is the default continuity source', async () => {
  let seenUrl = null;
  const out = await fetchWorldlineSnapshot({
    baseUrl:'https://example.test',
    limit:7,
    fetchImpl: async url => {
      seenUrl = String(url);
      return { ok:true, status:200, json:async()=>trustedSnapshot };
    }
  });
  assert.equal(out.ok, true);
  assert.equal(out.trust, 'trusted');
  assert.match(seenUrl, /worldline\/v4\/snapshot/);
  assert.match(seenUrl, /limit=7/);
});

test('trusted snapshot seeds local state and preserves writer provenance', () => {
  const out = seedWorldlineFromSnapshot(trustedSnapshot);
  assert.equal(out.ok, true);
  assert.equal(out.imported, 1);
  const state = out.worldline.materialize();
  assert.equal(state.facts.rewrite.value.status, 'ready');
  assert.equal(state.facts.rewrite.host, 'cell-a');
  assert.equal(out.worldline.events().find(e=>e.id==='e1').evidence.writerKeyId, 'k1');
  assert.equal(state.receipts['remote-worldline-snapshot'].trusted, true);
});

test('legacy snapshot requires explicit legacy trust mode', async () => {
  const wrong = await fetchWorldlineSnapshot({
    baseUrl:'https://example.test',
    fetchImpl: async () => ({ ok:true,status:200,json:async()=>legacySnapshot })
  });
  assert.equal(wrong.ok,false);
  assert.equal(wrong.code,'WORLDLINE_SCHEMA_MISMATCH');

  const accepted = await fetchWorldlineSnapshot({
    baseUrl:'https://example.test',
    trust:'legacy',
    fetchImpl: async url => {
      assert.match(String(url),/worldline\/snapshot/);
      return { ok:true,status:200,json:async()=>legacySnapshot };
    }
  });
  assert.equal(accepted.ok,true);
  const seeded=seedWorldlineFromSnapshot(accepted.snapshot);
  assert.equal(seeded.worldline.materialize().receipts['remote-worldline-snapshot'].trusted,false);
});

test('trusted schema without authenticated writer marker is rejected', async () => {
  const out = await fetchWorldlineSnapshot({
    baseUrl:'https://example.test',
    fetchImpl: async () => ({
      ok:true,status:200,
      json:async()=>({...trustedSnapshot,trust:'SOMETHING_ELSE'})
    })
  });
  assert.equal(out.ok,false);
  assert.equal(out.code,'WORLDLINE_SCHEMA_MISMATCH');
});
