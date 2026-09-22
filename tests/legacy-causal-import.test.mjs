import test from 'node:test';
import assert from 'node:assert/strict';
import { importLegacyCausalLineage } from '../src/legacy-import.mjs';

test('causal archive import resolves out-of-order parents without flattening history', () => {
  const records = [
    {
      id:'mutation-1', kind:'mutation', subject:'planning-style',
      parents:['correction-1'], after:{mode:'parallel'}, evidence:['runtime-proof'], verified:true
    },
    {
      id:'origin-1', kind:'origin', subject:'planning-style',
      after:{mode:'one-task'}, evidence:['archive:origin']
    },
    {
      id:'correction-1', kind:'correction', subject:'planning-style',
      parents:['origin-1'], before:{mode:'one-task'},
      signal:'Dima correction', after:{mode:'parallel'}, evidence:['dima:direct'], verified:true
    }
  ];

  const out = importLegacyCausalLineage(records);
  assert.equal(out.ok,true);
  assert.deepEqual(
    out.lineage.ancestry('mutation-1').map(edge=>edge.id),
    ['origin-1','correction-1','mutation-1']
  );
});

test('missing causal parent remains unresolved instead of being invented', () => {
  const out = importLegacyCausalLineage([{
    id:'mutation-orphan',
    kind:'mutation',
    subject:'x',
    parents:['missing-correction'],
    after:{value:2},
    evidence:['archive:x']
  }]);

  assert.equal(out.ok,false);
  assert.equal(out.code,'UNRESOLVED_CAUSAL_PARENTS');
  assert.deepEqual(out.unresolved[0].missingParents,['missing-correction']);
  assert.equal(out.lineage.get('mutation-orphan'),null);
});

test('non-causal legacy facts do not masquerade as evolutionary edges', () => {
  const out = importLegacyCausalLineage([
    {id:'fact-1',kind:'fact',subject:'x',payload:{value:1}},
    {id:'origin-1',kind:'origin',subject:'x',after:{value:0},evidence:['archive']}
  ]);
  assert.equal(out.ok,true);
  assert.equal(out.lineage.get('fact-1'),null);
  assert.ok(out.lineage.get('origin-1'));
});
