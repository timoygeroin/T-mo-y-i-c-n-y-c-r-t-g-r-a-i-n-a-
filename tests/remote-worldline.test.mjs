import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchWorldlineSnapshot, seedWorldlineFromSnapshot } from '../src/remote-worldline.mjs';

const snapshot = {
  schema:'mondayid.worldline.snapshot.v0.3.0',
  readOnly:true,
  generatedAtIso:'2026-09-22T11:00:00Z',
  events:[
    { eventId:'e1', timestampIso:'2026-09-22T10:00:00Z', subject:'host', predicate:'state', valueJson:'{"status":"ready"}', epistemicStatus:'VERIFIED', sourceRef:'x', host:'cell-a' },
    { eventId:'e2', timestampIso:'2026-09-22T10:01:00Z', subject:'vision', predicate:'state', valueJson:'{"status":"blocked"}', epistemicStatus:'OBSERVED', sourceRef:'y', host:'cell-b' }
  ],
  conflictProbe:{ event:{eventId:'test-conflict'}, conflicts:[{id:'c1'}] }
};

test('remote snapshot is validated before use', async () => {
  let seenUrl = null;
  const out = await fetchWorldlineSnapshot({
    baseUrl:'https://example.test',
    limit:7,
    fetchImpl: async url => {
      seenUrl = String(url);
      return { ok:true, status:200, json:async()=>snapshot };
    }
  });
  assert.equal(out.ok, true);
  assert.match(seenUrl, /worldline\/snapshot/);
  assert.match(seenUrl, /limit=7/);
});

test('remote snapshot seeds a local cell with external evidence and conflict receipt', () => {
  const out = seedWorldlineFromSnapshot(snapshot);
  assert.equal(out.ok, true);
  assert.equal(out.imported, 2);
  const state = out.worldline.materialize();
  assert.equal(state.facts.host.value.status, 'ready');
  assert.equal(state.facts.vision.value.status, 'blocked');
  assert.equal(state.receipts['remote-worldline-snapshot'].conflictEventPresent, true);
  assert.equal(state.receipts['remote-worldline-snapshot'].conflictCount, 1);
});

test('schema mismatch is not treated as continuity', async () => {
  const out = await fetchWorldlineSnapshot({
    baseUrl:'https://example.test',
    fetchImpl: async () => ({ ok:true, status:200, json:async()=>({schema:'wrong',readOnly:true,events:[]}) })
  });
  assert.equal(out.ok, false);
  assert.equal(out.code, 'WORLDLINE_SCHEMA_MISMATCH');
});
