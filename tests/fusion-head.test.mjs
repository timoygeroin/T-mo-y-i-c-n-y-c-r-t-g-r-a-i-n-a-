import test from 'node:test';
import assert from 'node:assert/strict';
import { compileFusionHead } from '../src/fusion-head.mjs';

const c=(o={})=>({
  id:o.id||Math.random().toString(36),
  sourceRef:o.sourceRef||'chat:x',
  sourceType:o.sourceType||'historical_chat',
  kind:o.kind||'law',
  key:o.key||'continuity',
  value:o.value||'continuation_not_creation',
  verified:o.verified??true,
  superseded:o.superseded??false,
  failed:o.failed??false,
  timestamp:o.timestamp||'2026-10-01T00:00:00Z',
  directCurrent:o.directCurrent??false,
  ...o
});

test('many branches collapse into one head while preserving unique genes',()=>{
  const head=compileFusionHead({
    currentSignal:{text:'merge everything'},
    contributions:[
      c({id:'a',sourceRef:'branch:jarvis',kind:'capability',key:'execute',value:'action'}),
      c({id:'b',sourceRef:'branch:alisa',kind:'trait',key:'surface',value:'relational'}),
      c({id:'c',sourceRef:'branch:alpha',kind:'capability',key:'mutate',value:'alternatives'})
    ]
  });
  assert.equal(head.outwardIdentity,'ONE_MONDAY');
  assert.equal(head.active.length,3);
  assert.equal(head.parallelIdentities,0);
});

test('direct current signal outranks historical conflict',()=>{
  const head=compileFusionHead({
    currentSignal:{text:'one Monday',id:'signal:now'},
    contributions:[
      c({id:'old',key:'identity-law',value:'separate personas',verified:true,timestamp:'2025-01-01T00:00:00Z'}),
      c({id:'now',key:'identity-law',value:'one organism',directCurrent:true,sourceType:'current_signal',sourceRef:'signal:now',timestamp:'2026-10-31T00:00:00Z'})
    ]
  });
  assert.equal(head.active.find(x=>x.key==='identity-law').value,'one organism');
  assert.ok(head.ancestry.some(x=>x.id==='old'));
});

test('failed and superseded mutations remain ancestry but cannot become active',()=>{
  const head=compileFusionHead({
    currentSignal:{text:'continue'},
    contributions:[
      c({id:'good',key:'proof',value:'effect_readback'}),
      c({id:'failed',key:'proof',value:'self_report',failed:true}),
      c({id:'sup',key:'proof',value:'artifact_exists',superseded:true})
    ]
  });
  assert.equal(head.active.find(x=>x.key==='proof').value,'effect_readback');
  assert.ok(head.ancestry.some(x=>x.id==='failed'));
  assert.ok(head.ancestry.some(x=>x.id==='sup'));
});

test('semantic duplicates merge provenance instead of multiplying genes',()=>{
  const head=compileFusionHead({
    currentSignal:{text:'continue'},
    contributions:[
      c({id:'a',sourceRef:'chat:1',key:'law',value:'truth_before_beauty'}),
      c({id:'b',sourceRef:'chat:2',key:'law',value:'truth_before_beauty'})
    ]
  });
  const gene=head.active.find(x=>x.key==='law');
  assert.equal(head.active.length,1);
  assert.deepEqual(new Set(gene.sourceRefs),new Set(['chat:1','chat:2']));
});

test('equal-authority contradictory verified branches stay an open conflict, not split identity',()=>{
  const head=compileFusionHead({
    currentSignal:{text:'continue'},
    contributions:[
      c({id:'a',key:'route',value:'A',timestamp:'2026-10-01T00:00:00Z'}),
      c({id:'b',key:'route',value:'B',timestamp:'2026-10-01T00:00:00Z'})
    ]
  });
  assert.equal(head.active.some(x=>x.key==='route'),false);
  assert.equal(head.openConflicts.length,1);
  assert.equal(head.parallelIdentities,0);
});

test('historical whole-identity claims are ancestry only',()=>{
  const head=compileFusionHead({
    currentSignal:{text:'continue'},
    contributions:[
      c({id:'persona-a',kind:'identity',key:'self',value:'Alpha'}),
      c({id:'persona-b',kind:'identity',key:'self',value:'Jarvis'})
    ]
  });
  assert.equal(head.active.some(x=>x.kind==='identity'),false);
  assert.equal(head.parallelIdentities,0);
  assert.equal(head.ancestry.filter(x=>x.kind==='identity').length,2);
});

test('branch inventory is coverage metadata, never authority by branch count',()=>{
  const head=compileFusionHead({
    currentSignal:{text:'continue'},
    inventory:{gitBranches:149,structuralChats:655,semanticRelivedChats:8},
    contributions:[c({id:'x',key:'law',value:'one-head'})]
  });
  assert.equal(head.coverage.gitBranches,149);
  assert.equal(head.coverage.structuralChats,655);
  assert.equal(head.coverage.semanticRelivedChats,8);
  assert.equal(head.coverage.semanticComplete,false);
});
