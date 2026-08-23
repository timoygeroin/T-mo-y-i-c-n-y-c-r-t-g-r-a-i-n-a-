import test from 'node:test';
import assert from 'node:assert/strict';
import { decideDimaTwin } from '../src/dima-twin.js';

const reversiblePortal = {
  description: 'publish portal preview',
  expectedEffect: 'portal preview becomes available',
  changesExternalState: true,
  reversible: true,
};

test('direct current Dima authority overrides weaker memory', () => {
  const result = decideDimaTwin({
    objective: 'publish portal preview',
    candidate: reversiblePortal,
    evidence: [
      { id: 'memory-1', tier: 'memory', stance: 'prefer', statement: 'publish portal preview', target: 'portal' },
      { id: 'current-1', tier: 'direct_current_instruction', stance: 'forbid', statement: 'do not publish portal preview', target: 'portal' },
    ],
  });
  assert.equal(result.decision, 'REJECT');
  assert.deepEqual(result.basis, ['current-1']);
});

test('missing relevant Dima authority forces abstention', () => {
  const result = decideDimaTwin({ objective: 'publish portal preview', candidate: reversiblePortal, evidence: [] });
  assert.equal(result.decision, 'ABSTAIN');
  assert.ok(result.blockers.includes('NO_RELEVANT_DIMA_AUTHORITY'));
});

test('same-tier conflict forces abstention instead of inventing a preference', () => {
  const result = decideDimaTwin({
    objective: 'publish portal preview',
    candidate: reversiblePortal,
    evidence: [
      { id: 'a', tier: 'direct_current_instruction', stance: 'prefer', statement: 'publish portal preview', target: 'portal' },
      { id: 'b', tier: 'direct_current_instruction', stance: 'forbid', statement: 'do not publish portal preview', target: 'portal' },
    ],
  });
  assert.equal(result.decision, 'ABSTAIN');
  assert.ok(result.blockers.includes('CONFLICTING_TOP_TIER_DIMA_AUTHORITY'));
});

test('irreversible action without direct current authorization keeps human gate', () => {
  const result = decideDimaTwin({
    objective: 'delete production data',
    candidate: { description: 'delete production data', expectedEffect: 'production data deleted', changesExternalState: true, reversible: false },
    evidence: [{ id: 'archive-1', tier: 'dima_authored_archive', stance: 'authorize', statement: 'delete production data', target: 'production data' }],
  });
  assert.equal(result.decision, 'ABSTAIN');
  assert.ok(result.blockers.includes('HUMAN_GATE_REQUIRED_FOR_IRREVERSIBLE'));
  assert.equal(result.delegation.mayActAsUser, false);
});

test('DIMA Twin never exposes impersonation authority', () => {
  const result = decideDimaTwin({
    objective: 'publish portal preview',
    candidate: reversiblePortal,
    evidence: [{ id: 'current-approve', tier: 'direct_current_instruction', stance: 'authorize', statement: 'publish portal preview', target: 'portal' }],
  });
  assert.equal(result.decision, 'APPROVE');
  assert.equal(result.delegation.mayActAsUser, false);
});
