import test from 'node:test';
import assert from 'node:assert/strict';
import { OrganismCell } from '../src/organism-cell.mjs';
import { CausalLineage } from '../src/causal-lineage.mjs';

test('a child cell carries the whole organism geometry instead of one specialist role', () => {
  const root = new OrganismCell({id:'root'});
  const child = root.spawn('chat:live-message');
  assert.equal(child.describe().wholeOrganism,true);
  assert.deepEqual(child.describe().geometry,root.describe().geometry);
  assert.equal(child.parentId,'root');
});

test('Alpha mutation cannot promote when mini-Dima has no evidence', async () => {
  const cell = new OrganismCell({id:'root'});
  const out = await cell.evaluateMutation({
    subject:'planning-style',
    mutation:{id:'planning-style',statement:'parallel frontier'},
    evidence:['runtime-proof'],
    verification:{ok:true}
  });
  assert.equal(out.ok,false);
  assert.equal(out.state,'CANDIDATE');
  assert.equal(out.code,'DIMA_REFERENCE_UNKNOWN');
});

test('Alpha + mini-Dima + Anti can promote a verified evidence-backed mutation', async () => {
  const lineage = new CausalLineage();
  lineage.append({
    kind:'correction',
    subject:'planning-style',
    after:{forbid:['one-task'],require:'parallel frontier'},
    evidence:['dima:2026-09-22'],
    epistemic:'verified'
  });

  const cell = new OrganismCell({id:'root',lineage});
  const out = await cell.evaluateMutation({
    subject:'planning-style',
    mutation:{id:'planning-style',statement:'compile one shared intent graph and execute an independent parallel frontier'},
    evidence:['runtime-proof:parallel-frontier'],
    verification:{ok:true,regression:'recursive-cell-r1'}
  });

  assert.equal(out.ok,true);
  assert.equal(out.state,'PROMOTED');
  assert.equal(out.dima.verdict,'SUPPORTED');
  assert.equal(out.anti.ok,true);
  assert.equal(out.policy.generation,1);
  assert.ok(out.causalEdge);
});

test('Anti can hold a mutation even when mini-Dima supports it', async () => {
  const lineage = new CausalLineage();
  lineage.append({
    kind:'correction',subject:'x',
    after:{require:'safe change'},evidence:['dima:direct'],epistemic:'verified'
  });
  const cell = new OrganismCell({
    id:'root',lineage,
    anti:async()=>({ok:false,code:'COUNTEREXAMPLE_FOUND'})
  });
  const out = await cell.evaluateMutation({
    subject:'x',
    mutation:{id:'x',statement:'safe change'},
    evidence:['proof'],
    verification:{ok:true}
  });
  assert.equal(out.ok,false);
  assert.equal(out.code,'COUNTEREXAMPLE_FOUND');
});
