import test from 'node:test';
import assert from 'node:assert/strict';
import { seedWorldlineFromSnapshot } from '../src/remote-worldline.mjs';

const snapshot=(overrides={})=>({
  schema:'mondayid.worldline.snapshot.v0.4.0',
  trust:'AUTHENTICATED_MACHINE_WRITER',
  readOnly:true,
  generatedAtIso:'2026-10-25T00:00:00Z',
  events:[{
    eventId:'e1', timestampIso:'2026-10-25T00:00:00Z',
    subject:'scope', predicate:'state', valueJson:'{"x":1}',
    epistemicStatus:'VERIFIED', sourceRef:'provider-a',
    host:'cell-a', writerKeyId:'writer-a'
  }],
  conflictProbe:{conflicts:[]},
  ...overrides
});

test('same event list but new conflicts must supersede snapshot receipt',()=>{
  const first=seedWorldlineFromSnapshot(snapshot());
  assert.equal(first.ok,true);
  const second=seedWorldlineFromSnapshot(
    snapshot({conflictProbe:{conflicts:[{eventId:'e1',code:'CONFLICT'}]}}),
    first.worldline
  );
  assert.equal(second.ok,true);
  assert.equal(second.worldline.materialize().receipts['remote-worldline-snapshot'].conflictCount,1);
  assert.equal(second.worldline.materialize().receipts['remote-worldline-snapshot'].externalEffectsVerified,false);
});

test('same event list but lower trust must not inherit a stale trusted receipt',()=>{
  const first=seedWorldlineFromSnapshot(snapshot());
  const second=seedWorldlineFromSnapshot(
    snapshot({schema:'mondayid.worldline.snapshot.v0.3.0',trust:'LEGACY_UNAUTHENTICATED_STREAM'}),
    first.worldline
  );
  assert.equal(second.ok,true);
  const receipt=second.worldline.materialize().receipts['remote-worldline-snapshot'];
  assert.equal(receipt.trusted,false);
  assert.equal(receipt.externalEffectsVerified,false);
});

test('exact repeated snapshot is idempotent',()=>{
  const first=seedWorldlineFromSnapshot(snapshot());
  const count=first.worldline.events().length;
  const second=seedWorldlineFromSnapshot(snapshot(),first.worldline);
  assert.equal(second.ok,true);
  assert.equal(second.worldline.events().length,count);
});
