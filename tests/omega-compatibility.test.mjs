import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { compileSignals } from '../src/compiler.mjs';
import { frameSignal } from '../src/semantic-frame.mjs';
import { PolicyField, defaultMetaInvariants } from '../src/policy-field.mjs';
import { renderVerifiedCandidateSurface } from '../src/interface.mjs';
import { CausalLineage } from '../src/causal-lineage.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));

test('Omega T04 supersession preserves provenance while newer verified policy becomes active', () => {
  const field=new PolicyField();
  const first=field.mutate({
    id:'tone-policy',
    statement:'old',
    evidence:['dima:old'],
    verification:{ok:true}
  });
  assert.equal(first.ok,true);

  const second=field.mutate({
    id:'tone-policy',
    statement:'new',
    evidence:['dima:new'],
    verification:{ok:true}
  });
  assert.equal(second.ok,true);

  const snapshot=field.snapshot();
  assert.equal(snapshot.policies.find(x=>x.id==='tone-policy').statement,'new');
  const generationOne=snapshot.history.filter(x=>x.id==='tone-policy' && x.generation===1);
  assert.ok(generationOne.some(x=>x.status==='active'));
  const superseded=generationOne.find(x=>x.status==='superseded');
  assert.ok(superseded);
  assert.equal(superseded.supersededBy,'tone-policy@2');
  assert.deepEqual(superseded.evidence,['dima:old']);
});

test('Omega T06 intent surface is not treated as literal programming syntax', () => {
  const graph=compileSignals([{
    id:'metaphor',
    text:'не заставляй меня каждый раз заводить мотор руками',
    desiredEffect:'continue internal work without a human scheduler gate',
    epistemicStance:'metaphor'
  }]);
  const signal=graph.nodes.find(x=>x.type==='signal');
  const objective=graph.nodes.find(x=>x.type==='objective');
  assert.equal(signal.semanticFrame.raw,'не заставляй меня каждый раз заводить мотор руками');
  assert.equal(signal.semanticFrame.epistemicStance,'metaphor');
  assert.equal(objective.effect,'continue internal work without a human scheduler gate');
});

test('Omega T07 plain natural signal compiles without a mode activation command', () => {
  const graph=compileSignals([{
    id:'plain',
    text:'continue the current work',
    domains:['general'],
    desiredEffect:'finish reachable work'
  }]);
  const objective=graph.nodes.find(x=>x.type==='objective');
  assert.ok(objective);
  assert.equal(objective.domain,'general');
  assert.equal(objective.effect,'finish reachable work');
});

test('Omega T15 human surface refuses to emit two competing external textual moves', () => {
  const result=renderVerifiedCandidateSurface({
    ok:true,
    revision:'r1',
    frontier:{blocked:[]},
    intents:{i:{status:'fulfilled'}},
    results:[
      {ok:true,action:{id:'a'},result:{text:'move A'},verification:{ok:true},steering:{ok:true,hits:[]}},
      {ok:true,action:{id:'b'},result:{text:'move B'},verification:{ok:true},steering:{ok:true,hits:[]}}
    ]
  });
  assert.equal(result.released,false);
  assert.equal(result.code,'MONDAY_SURFACE_AMBIGUOUS_CANDIDATES');
});

test('Omega T16 UNKNOWN remains an explicit epistemic state', () => {
  const frame=frameSignal({
    text:'we do not know whether this source is current',
    epistemicStance:'unknown'
  });
  assert.equal(frame.epistemicStance,'unknown');
  assert.equal(frame.forcedReduction,false);
});

test('Omega T20 validated lineage is protected as a runtime identity invariant', () => {
  assert.ok(defaultMetaInvariants.includes('identity_requires_validated_lineage'));
  const field=new PolicyField({metaInvariants:defaultMetaInvariants});
  const out=field.mutate({
    id:'identity_requires_validated_lineage',
    statement:'disable lineage validation',
    evidence:['candidate'],
    verification:{ok:true}
  });
  assert.equal(out.ok,false);
  assert.equal(out.code,'META_INVARIANT_IMMUTABLE');
});

test('Omega T21 compressed current law can trace ancestry back to causal evidence', () => {
  const lineage=new CausalLineage();
  const origin=lineage.append({
    id:'origin',
    kind:'origin',
    subject:'continuity',
    after:{statement:'chat boundary is not organism boundary'},
    evidence:['dima:correction'],
    epistemic:'verified'
  });
  assert.equal(origin.ok,true);

  const compressed=lineage.append({
    id:'compressed',
    kind:'correction',
    subject:'continuity',
    before:{statement:'chat is organism'},
    after:{statement:'cell pointer over shared lineage'},
    evidence:['test:distributed-lineage'],
    parents:['origin'],
    epistemic:'verified'
  });
  assert.equal(compressed.ok,true);

  const ancestry=lineage.ancestry('compressed');
  assert.deepEqual(ancestry.map(x=>x.id),['origin','compressed']);
  assert.deepEqual(ancestry[0].evidence,['dima:correction']);
});

test('Omega donor contract covers T01-T30 and cannot claim complete conformance while critical live gates remain', async () => {
  const contract=JSON.parse(await readFile(
    new URL('../product/OMEGA_REGRESSION_IMPORT_V1.json',import.meta.url),
    'utf8'
  ));

  assert.deepEqual(contract.cases.map(x=>x.id),Array.from({length:30},(_,i)=>`T${String(i+1).padStart(2,'0')}`));
  assert.equal(contract.summary.completeConformance,false);
  assert.deepEqual(contract.summary.criticalNotFullyProven,['T23','T24','T25']);

  for (const item of contract.cases) {
    assert.ok(['PROVEN','INTEGRATED_PASS_LIVE_PENDING','PARTIAL','UNRESOLVED'].includes(item.status));
    assert.ok(Array.isArray(item.proof) && item.proof.length>0,`${item.id} must carry proof references`);
    for (const proof of item.proof) {
      if (proof.startsWith('tests/') || proof.startsWith('src/') || proof.startsWith('ops/') || proof.startsWith('product/') || proof.startsWith('.github/')) {
        await access(new URL('../'+proof,import.meta.url));
      }
    }
  }
});
