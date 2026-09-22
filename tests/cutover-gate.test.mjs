import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluateCutover, REQUIRED_CUTOVER_PROOFS } from '../src/cutover-gate.mjs';

test('current rewrite manifest is ready only because every required live proof is explicit', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../CUTOVER.json', import.meta.url),'utf8'));
  const out = evaluateCutover(manifest.receipts);
  assert.equal(manifest.status,'READY_FOR_CODE_CUTOVER');
  assert.equal(out.ready,true);
  assert.equal(out.state,'READY');
  assert.deepEqual(out.missing,[]);
  assert.equal(manifest.receipts.real_effect_receptor.verification,'external-exact-readback');
  assert.equal(manifest.receipts.shared_worldline_write.live_proof.conflict_resolution,'UNRESOLVED_NO_OVERWRITE');
  assert.equal(manifest.receipts.user_visible_effect.state,'BOUND');
  assert.equal(manifest.receipts.no_spend_boundary.ok,true);
});

test('one missing proof blocks cutover even when every other receipt is true', () => {
  const receipts = Object.fromEntries(REQUIRED_CUTOVER_PROOFS.map(key => [key,{ok:true}]));
  receipts.user_visible_effect = {ok:false};
  const out = evaluateCutover(receipts);
  assert.equal(out.ready,false);
  assert.equal(out.state,'BLOCKED');
  assert.deepEqual(out.missing,['user_visible_effect']);
});

test('unknown extra evidence cannot substitute for a required receipt', () => {
  const receipts = Object.fromEntries(REQUIRED_CUTOVER_PROOFS.map(key => [key,{ok:true}]));
  delete receipts.shared_worldline_write;
  receipts.pretty_demo = {ok:true};
  const out = evaluateCutover(receipts);
  assert.equal(out.ready,false);
  assert.ok(out.missing.includes('shared_worldline_write'));
});
