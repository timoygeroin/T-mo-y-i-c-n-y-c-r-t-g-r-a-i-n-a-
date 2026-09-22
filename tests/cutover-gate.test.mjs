import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  evaluateCutover,
  evaluateCutoverManifest,
  REQUIRED_CUTOVER_PROOFS
} from '../src/cutover-gate.mjs';

test('current manifest is COMPLETE only because live proofs, code cutover and trusted receipt all exist', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../CUTOVER.json', import.meta.url),'utf8'));
  const proof = evaluateCutover(manifest.receipts);
  const phase = evaluateCutoverManifest(manifest);

  assert.equal(manifest.status,'CUTOVER_COMPLETE');
  assert.equal(proof.ready,true);
  assert.equal(proof.state,'READY');
  assert.deepEqual(proof.missing,[]);

  assert.equal(phase.ok,true);
  assert.equal(phase.phase,'CUTOVER_COMPLETE');
  assert.equal(phase.state,'COMPLETE');
  assert.deepEqual(phase.missing,[]);

  assert.equal(manifest.code_cutover.ok,true);
  assert.equal(manifest.external_receipt_after_cutover.trusted_worldline_write.ok,true);
  assert.equal(manifest.external_receipt_after_cutover.trusted_worldline_write.exact_value_match,true);
  assert.equal(manifest.external_receipt_after_cutover.trusted_worldline_write.conflict_count,0);

  assert.equal(manifest.receipts.real_effect_receptor.verification,'external-exact-readback');
  assert.equal(manifest.receipts.shared_worldline_write.live_proof.conflict_resolution,'UNRESOLVED_NO_OVERWRITE');
  assert.equal(manifest.receipts.user_visible_effect.state,'BOUND');
  assert.equal(manifest.receipts.no_spend_boundary.ok,true);
});

test('all live proofs with READY status represent a valid pre-cutover phase', () => {
  const receipts = Object.fromEntries(REQUIRED_CUTOVER_PROOFS.map(key => [key,{ok:true}]));
  const out = evaluateCutoverManifest({
    status:'READY_FOR_CODE_CUTOVER',
    receipts
  });
  assert.equal(out.ok,true);
  assert.equal(out.phase,'READY_FOR_CODE_CUTOVER');
  assert.equal(out.state,'READY');
});

test('CUTOVER_COMPLETE fails closed without a trusted post-cutover Worldline receipt', () => {
  const receipts = Object.fromEntries(REQUIRED_CUTOVER_PROOFS.map(key => [key,{ok:true}]));
  const out = evaluateCutoverManifest({
    status:'CUTOVER_COMPLETE',
    receipts,
    code_cutover:{ok:true},
    external_receipt_after_cutover:{trusted_worldline_write:{ok:false}}
  });
  assert.equal(out.ok,false);
  assert.equal(out.state,'BLOCKED');
  assert.deepEqual(out.missing,['trusted_worldline_cutover_receipt']);
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
