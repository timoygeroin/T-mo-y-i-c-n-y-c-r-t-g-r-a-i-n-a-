import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const r=JSON.parse(fs.readFileSync(new URL('../ops/live-transfer-20261021.json',import.meta.url),'utf8'));
test('live transfer is only proven by two independent process receipts',()=>{
  assert.equal(r.schema,'mondayid.live-clean-host-transfer-receipt.v1');
  assert.equal(r.result,'VERIFIED');
  assert.equal(r.first.commandResult,'CLEAN_HOST_TRANSFER_PASS');
  assert.equal(r.first.exactReadback,true);
  assert.equal(r.first.conflicts,0);
  assert.equal(r.second.deployState,'READY');
  assert.equal(r.second.inheritedEvent,true);
  assert.equal(r.second.materializedFact,true);
  assert.equal(r.first.deployState,'ERROR_AFTER_PROOF');
  assert.equal(r.noSecretValuesEmitted,true);
  assert.equal(r.paidInferenceUsed,false);
  assert.equal(r.eventId,'E-RW4-5f61949ba6052a4f3e1ec1c6');
  assert.ok(r.claimBoundary.notProven.includes('native iPhone physical install'));
});
