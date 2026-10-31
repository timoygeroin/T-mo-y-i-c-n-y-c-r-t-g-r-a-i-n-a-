import test from 'node:test';
import assert from 'node:assert/strict';
import { createMondayControlPlane } from '../src/monday-control-plane.mjs';
import { runMondayControlBurst } from '../src/control-plane-burst.mjs';

const task={
  id:'task:burst',
  exactObject:'improve the organism',
  desiredEffect:'verified progress without another user turn',
  genomeRef:'mondayid:whole-organism',
  signal:{text:'continue at maximum speed',novelty:0.9,ambiguity:0.7,historicalDepth:0.8}
};

test('control burst executes multiple whole-genome generations in one invocation', async()=>{
  const cp=createMondayControlPlane({maxCells:4});
  const result=await runMondayControlBurst({
    controlPlane:cp,
    task,
    generations:4,
    roles:({generation})=>[
      {role:'builder',objective:`build-g${generation}`},
      {role:'falsifier',objective:`break-g${generation}`}
    ],
    executeCell:async(cell)=>({
      cellId:cell.id,
      verified:true,
      materialDelta:true,
      score:cell.role==='builder' ? cell.generation*10 : cell.generation*10-1,
      effect:`effect-${cell.generation}-${cell.role}`
    })
  });
  assert.equal(result.generationsAttempted,4);
  assert.equal(result.generationsAccepted,4);
  assert.equal(result.champion.score,40);
  assert.equal(result.lineage.length,4);
  assert.equal(result.stopReason,'PASS_BUDGET');
});

test('cells in a generation execute concurrently, not serially', async()=>{
  const cp=createMondayControlPlane({maxCells:3});
  let active=0,maxActive=0;
  const result=await runMondayControlBurst({
    controlPlane:cp,
    task,
    generations:1,
    roles:()=>[
      {role:'a',objective:'a'},
      {role:'b',objective:'b'},
      {role:'c',objective:'c'}
    ],
    executeCell:async(cell)=>{
      active++; maxActive=Math.max(maxActive,active);
      await new Promise(r=>setTimeout(r,20));
      active--;
      return {cellId:cell.id,verified:true,materialDelta:true,score:cell.role==='c'?3:1,effect:cell.role};
    }
  });
  assert.equal(result.generationsAccepted,1);
  assert.ok(maxActive>=2);
});

test('unverified or non-material cells never become ancestors', async()=>{
  const cp=createMondayControlPlane({maxCells:3});
  const result=await runMondayControlBurst({
    controlPlane:cp,
    task,
    generations:2,
    roles:()=>[
      {role:'fake',objective:'huge score'},
      {role:'real',objective:'small verified delta'}
    ],
    executeCell:async(cell)=>cell.role==='fake'
      ? {cellId:cell.id,verified:false,materialDelta:true,score:999,effect:'fake'}
      : {cellId:cell.id,verified:true,materialDelta:true,score:2,effect:'real'}
  });
  assert.equal(result.generationsAccepted,1);
  assert.equal(result.champion.effect,'real');
  assert.ok(result.rejected.some(x=>x.effect==='fake'));
});

test('strict-improvement gate prevents regression from becoming next parent', async()=>{
  const cp=createMondayControlPlane({maxCells:2});
  const result=await runMondayControlBurst({
    controlPlane:cp,
    task,
    generations:3,
    plateauLimit:2,
    roles:({generation})=>[{role:'builder',objective:`g${generation}`}],
    executeCell:async(cell)=>({
      cellId:cell.id,
      verified:true,
      materialDelta:true,
      score:cell.generation===1?10:5,
      effect:`g${cell.generation}`
    })
  });
  assert.equal(result.champion.effect,'g1');
  assert.equal(result.generationsAccepted,1);
  assert.equal(result.stopReason,'EVIDENCE_PLATEAU');
});

test('human gate stops burst immediately and is preserved as the blocker', async()=>{
  const cp=createMondayControlPlane({maxCells:2});
  const result=await runMondayControlBurst({
    controlPlane:cp,
    task,
    generations:8,
    roles:()=>[{role:'revenue',objective:'attempt paid action'}],
    executeCell:async(cell)=>({
      cellId:cell.id,
      verified:true,
      materialDelta:false,
      score:0,
      humanGate:{code:'PAYMENT_AUTH_REQUIRED',reason:'binding transaction'}
    })
  });
  assert.equal(result.stopReason,'HUMAN_GATE');
  assert.equal(result.humanGate.code,'PAYMENT_AUTH_REQUIRED');
  assert.equal(result.generationsAttempted,1);
});

test('verified terminal effect stops without ceremonial extra generations', async()=>{
  const cp=createMondayControlPlane({maxCells:2});
  const result=await runMondayControlBurst({
    controlPlane:cp,
    task,
    generations:8,
    roles:()=>[{role:'builder',objective:'finish'}],
    executeCell:async(cell)=>({
      cellId:cell.id,
      verified:true,
      materialDelta:true,
      score:100,
      effect:'finished',
      terminal:true
    })
  });
  assert.equal(result.stopReason,'VERIFIED_EFFECT');
  assert.equal(result.generationsAttempted,1);
  assert.equal(result.champion.effect,'finished');
});
