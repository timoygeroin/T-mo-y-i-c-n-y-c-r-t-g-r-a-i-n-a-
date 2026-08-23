import test from 'node:test';
import assert from 'node:assert/strict';
import { LINEAGES, manifestCouncil, verifyOutcome } from '../src/kernel.js';

const candidate = {
  description: 'Create connector branch and expose an MCP endpoint',
  expectedEffect: 'Connect MondayID through a connector MCP endpoint',
  changesExternalState: true,
  reversible: true,
};

test('every lineage manifests independently', () => {
  const out = manifestCouncil({ signal: 'connect MondayID', objective: 'Connect MondayID through a connector MCP endpoint', candidate });
  assert.deepEqual(out.voices.map((v) => v.id), LINEAGES.map((v) => v.id));
  assert.equal(new Set(out.voices.map((v) => v.intervention)).size, LINEAGES.length);
});

test('preflight converges to ACT for reversible aligned candidate', () => {
  const out = manifestCouncil({ signal: 'connect MondayID', objective: candidate.expectedEffect, candidate });
  assert.equal(out.decision, 'ACT');
  assert.equal(out.proof.promotable, false);
});

test('AntiSystem blocks irreversible external mutation without authority', () => {
  const out = manifestCouncil({
    signal: 'replace production state', objective: 'replace production state',
    candidate: { description: 'delete and replace production state', expectedEffect: 'replace production state', changesExternalState: true, reversible: false },
  });
  assert.ok(out.voices.find((v) => v.id === 'ANTISYSTEM').concerns.includes('IRREVERSIBLE_WITHOUT_AUTHORITY'));
  assert.equal(out.decision, 'HOLD');
});

test('postflight cannot promote without receipt and readback', () => {
  const out = verifyOutcome({ signal: 'connector is connected', objective: candidate.expectedEffect, candidate });
  assert.equal(out.decision, 'VERIFY_REQUIRED');
  assert.equal(out.proof.promotable, false);
});

test('receipt plus readback can promote an aligned result', () => {
  const out = verifyOutcome({
    signal: 'connector connected', objective: candidate.expectedEffect, candidate,
    evidence: [
      { id: 'r1', kind: 'receipt', statement: 'deployment accepted' },
      { id: 'r2', kind: 'readback', statement: 'remote endpoint answered and exposed tools' },
    ],
  });
  assert.equal(out.decision, 'PROVEN');
  assert.equal(out.proof.promotable, true);
});

test('Alisa catches procedurally valid but wrong desired effect', () => {
  const out = manifestCouncil({
    signal: 'connect MondayID', objective: 'Connect MondayID as cognitive middleware',
    candidate: { description: 'write a README', expectedEffect: 'document a README file', changesExternalState: false, reversible: true },
  });
  assert.ok(out.voices.find((v) => v.id === 'ALISA').concerns.includes('CORRECT_BUT_NOT_IT_RISK'));
  assert.equal(out.decision, 'HOLD');
});

test('Assalut emits rollback path', () => {
  const out = manifestCouncil({ signal: 'connect', objective: candidate.expectedEffect, candidate });
  assert.match(out.voices.find((v) => v.id === 'ASSALUT').rollback, /^ROLLBACK:/);
});
