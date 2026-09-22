import test from 'node:test';
import assert from 'node:assert/strict';
import { PolicyField, defaultMetaInvariants } from '../src/policy-field.mjs';

test('behavior policy can evolve without mutating identity invariants', () => {
  const field = new PolicyField({ metaInvariants:defaultMetaInvariants });
  const first = field.mutate({
    id:'planning-style',
    statement:'prefer one active task',
    evidence:['legacy:e1'],
    verification:{ok:true, regression:'r1'}
  });
  assert.equal(first.ok, true);

  const second = field.mutate({
    id:'planning-style',
    statement:'compile one shared intent graph and execute an independent parallel frontier',
    evidence:['dima:2026-09-22','runtime-proof:parallel-frontier'],
    verification:{ok:true, regression:'r2'}
  });
  assert.equal(second.ok, true);
  assert.equal(second.policy.generation, 2);
  assert.match(second.policy.supersedes, /planning-style@1/);
  assert.deepEqual(field.metaInvariants, defaultMetaInvariants);
});

test('policy mutation without evidence or verification cannot become organism behavior', () => {
  const field = new PolicyField({ metaInvariants:defaultMetaInvariants });
  assert.equal(field.mutate({id:'x',statement:'guess'}).code, 'NO_EVIDENCE');
  assert.equal(field.mutate({id:'x',statement:'guess',evidence:['e']}).code, 'UNVERIFIED_MUTATION');
});

test('meta invariants cannot silently become mutable policy', () => {
  const field = new PolicyField({ metaInvariants:defaultMetaInvariants });
  const out = field.mutate({
    id:'truth_requires_evidence',
    statement:'ignore evidence',
    evidence:['bad'],
    verification:{ok:true}
  });
  assert.equal(out.ok, false);
  assert.equal(out.code, 'META_INVARIANT_IMMUTABLE');
});
