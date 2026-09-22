import test from 'node:test';
import assert from 'node:assert/strict';
import { CausalLineage, evidenceBoundDimaReference } from '../src/causal-lineage.mjs';

test('causal lineage preserves origin -> correction -> mutation ancestry', () => {
  const lineage = new CausalLineage();
  const origin = lineage.append({
    id:'origin-1', kind:'origin', subject:'planning-style',
    after:{mode:'one-task'}, evidence:['chat:old'], epistemic:'historical'
  });
  assert.equal(origin.ok,true);

  const correction = lineage.append({
    id:'correction-1', kind:'correction', subject:'planning-style',
    before:{mode:'one-task'}, signal:'Dima correction',
    after:{forbid:['one-task'], require:'parallel shared frontier'},
    evidence:['dima:2026-09-22'], parents:['origin-1'], epistemic:'verified'
  });
  assert.equal(correction.ok,true);

  const mutation = lineage.append({
    id:'mutation-1', kind:'mutation', subject:'planning-style',
    before:{mode:'one-task'}, after:{mode:'parallel shared frontier'},
    evidence:['runtime-proof'], parents:['correction-1'], epistemic:'verified'
  });
  assert.equal(mutation.ok,true);

  assert.deepEqual(
    lineage.ancestry('mutation-1').map(edge => edge.id),
    ['origin-1','correction-1','mutation-1']
  );
});

test('mini-Dima remains UNKNOWN without direct correction evidence', async () => {
  const lineage = new CausalLineage();
  const miniDima = evidenceBoundDimaReference(lineage);
  const out = await miniDima({subject:'x',proposal:{statement:'anything'}});
  assert.equal(out.verdict,'UNKNOWN');
});

test('mini-Dima rejects a mutation that reintroduces a directly forbidden pattern', async () => {
  const lineage = new CausalLineage();
  lineage.append({
    kind:'correction', subject:'planning-style',
    after:{forbid:['one-task']}, evidence:['dima:2026-09-22'], epistemic:'verified'
  });
  const miniDima = evidenceBoundDimaReference(lineage);
  const out = await miniDima({subject:'planning-style',proposal:{statement:'restore one-task scheduler'}});
  assert.equal(out.verdict,'CONTRADICTED');
});
