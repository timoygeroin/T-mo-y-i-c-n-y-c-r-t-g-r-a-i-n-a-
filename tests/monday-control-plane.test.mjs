import test from 'node:test';
import assert from 'node:assert/strict';
import { createMondayControlPlane } from '../src/monday-control-plane.mjs';

const baseTask={
  id:'task:root',
  exactObject:'advance MondayID and revenue worldlines',
  desiredEffect:'verified progress with less Dima orchestration',
  genomeRef:'mondayid:whole-organism',
  signal:{text:'continue at maximum speed'}
};

test('control plane creates specialized whole-genome cells, not competing identities',()=>{
  const cp=createMondayControlPlane({maxCells:6});
  const swarm=cp.spawn(baseTask,[
    {role:'builder',objective:'implement'},
    {role:'falsifier',objective:'break'},
    {role:'historian',objective:'recover'},
    {role:'revenue',objective:'monetize'}
  ]);
  assert.equal(swarm.cells.length,4);
  assert.ok(swarm.cells.every(c=>c.genomeRef==='mondayid:whole-organism'));
  assert.ok(swarm.cells.every(c=>c.identityOwner===false));
  assert.equal(new Set(swarm.cells.map(c=>c.role)).size,4);
  assert.ok(swarm.cells.every(c=>c.compute?.chipSchema==='mondayid.virtual-chip.v1'));
  assert.ok(swarm.cells.every(c=>c.compute?.hardware?.includes('CPU')));
  assert.ok(swarm.cells.every(c=>c.compute?.hardware?.includes('QPU')));
  assert.ok(swarm.cells.every(c=>c.compute?.fabric==='STATE_AND_RULE_ARE_COLOCATED'));
});

test('duplicate role/objective cells are compressed instead of multiplied',()=>{
  const cp=createMondayControlPlane({maxCells:8});
  const swarm=cp.spawn(baseTask,[
    {role:'builder',objective:'implement'},
    {role:'builder',objective:'implement'},
    {role:'builder',objective:'implement'},
    {role:'falsifier',objective:'break'}
  ]);
  assert.equal(swarm.cells.length,2);
  assert.equal(swarm.compressedDuplicates,2);
});

test('cell creation is bounded by budget and exact task',()=>{
  const cp=createMondayControlPlane({maxCells:3});
  const swarm=cp.spawn(baseTask,[
    {role:'a',objective:'1'},{role:'b',objective:'2'},{role:'c',objective:'3'},
    {role:'d',objective:'4'},{role:'e',objective:'5'}
  ]);
  assert.equal(swarm.cells.length,3);
  assert.ok(swarm.cells.every(c=>c.parentTaskId==='task:root'));
  assert.equal(swarm.truncated,2);
});

test('only verified material deltas survive collapse',()=>{
  const cp=createMondayControlPlane({maxCells:4});
  const swarm=cp.spawn(baseTask,[
    {role:'builder',objective:'implement'},
    {role:'falsifier',objective:'break'},
    {role:'revenue',objective:'monetize'}
  ]);
  const collapse=cp.collapse(swarm,[
    {cellId:swarm.cells[0].id,verified:true,materialDelta:true,score:7,effect:'implemented patch'},
    {cellId:swarm.cells[1].id,verified:false,materialDelta:true,score:99,effect:'unverified genius'},
    {cellId:swarm.cells[2].id,verified:true,materialDelta:false,score:10,effect:'extra prose'}
  ]);
  assert.equal(collapse.winner.effect,'implemented patch');
  assert.equal(collapse.survivors.length,1);
  assert.equal(collapse.rejected.length,2);
});

test('revenue cell cannot claim money without observed monetary evidence',()=>{
  const cp=createMondayControlPlane({maxCells:2});
  const swarm=cp.spawn(baseTask,[{role:'revenue',objective:'create revenue'}]);
  const collapse=cp.collapse(swarm,[
    {cellId:swarm.cells[0].id,verified:true,materialDelta:true,score:8,effect:'found lead',moneyClaim:1000000000,moneyObserved:0}
  ]);
  assert.equal(collapse.survivors.length,0);
  assert.equal(collapse.rejected[0].moneyClaimAllowed,false);
  assert.equal(collapse.rejected[0].moneyObserved,0);
});

test('controller can produce next generation from surviving mechanism without multiplying identity',()=>{
  const cp=createMondayControlPlane({maxCells:4});
  const g1=cp.spawn(baseTask,[{role:'builder',objective:'implement'}]);
  const c1=cp.collapse(g1,[{cellId:g1.cells[0].id,verified:true,materialDelta:true,score:2,effect:'v1'}]);
  const g2=cp.evolve(baseTask,c1,[
    {role:'builder',objective:'implement stronger'},
    {role:'falsifier',objective:'attack v1'}
  ]);
  assert.equal(g2.generation,2);
  assert.ok(g2.cells.every(c=>c.genomeRef==='mondayid:whole-organism'));
  assert.ok(g2.cells.every(c=>c.identityOwner===false));
  assert.equal(g2.parentWinner.effect,'v1');
});


test('different cell roles receive task-specific compute topology over the same genome',()=>{
  const cp=createMondayControlPlane({maxCells:4});
  const swarm=cp.spawn({
    ...baseTask,
    signal:{
      text:'solve by competing hypotheses and evidence',
      novelty:0.95,
      ambiguity:0.9,
      historicalDepth:1,
      recurrenceCost:0.8,
      consequence:0.8
    }
  },[
    {role:'builder',objective:'implement patch'},
    {role:'falsifier',objective:'find counterexample'},
    {role:'revenue',objective:'find monetizable effect'}
  ]);
  assert.ok(swarm.cells.every(c=>['HIGH','MAX'].includes(c.compute.tier)));
  assert.ok(swarm.cells.every(c=>c.compute.genomeRef==='mondayid:whole-organism'));
  assert.ok(swarm.cells.every(c=>c.compute.naturalOperators.includes('evolution')));
  assert.ok(swarm.cells.every(c=>c.compute.naturalOperators.includes('logic')));
});

test('control plane does not pretend virtual hardware performed external actions',()=>{
  const cp=createMondayControlPlane({maxCells:1});
  const swarm=cp.spawn(baseTask,[{role:'builder',objective:'implement'}]);
  assert.equal(swarm.cells[0].compute.externalActions,0);
  assert.equal(swarm.cells[0].externalActions,0);
});
