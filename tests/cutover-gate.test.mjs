import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluateCutover, REQUIRED_CUTOVER_PROOFS } from '../src/cutover-gate.mjs';

test('current rewrite is blocked from cutover until live effect/write/user-visible proofs exist', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../CUTOVER.json', import.meta.url),'utf8'));
  const out = evaluateCutover(manifest.receipts);
  assert.equal(out.ready,false);
  assert.equal(out.state,'BLOCKED');
  assert.ok(out.missing.includes('real_effect_receptor'));
  assert.ok(out.missing.includes('shared_worldline_write'));
  assert.ok(out.missing.includes('user_visible_effect'));
});

test('cutover can become ready only when every required proof is explicit', () => {
  const receipts = Object.fromEntries(REQUIRED_CUTOVER_PROOFS.map(key => [key,{ok:true}]));
  const out = evaluateCutover(receipts);
  assert.equal(out.ready,true);
  assert.deepEqual(out.missing,[]);
});
