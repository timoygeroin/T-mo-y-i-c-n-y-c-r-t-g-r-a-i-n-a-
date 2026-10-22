import test from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityFoundry } from '../src/foundry.mjs';
import { makeEffectCapsule } from '../src/effect-abi.mjs';
import { executeSubstratePlan } from '../src/substrate-optimizer.mjs';

test('the existing CapabilityFoundry plans effect strategies without spawning a builder',async()=>{
  let builds=0,executions=0;
  const foundry=new CapabilityFoundry({builder:async()=>{builds++;throw Error('should not build')}});
  const capsule=makeEffectCapsule({id:'reuse-001',intent:'Render existing object',capability:'document.render',maxCostUsd:0});
  const route={id:'local-transform',method:'deterministic',quality:'exact',provenance:'owned-code',
    resourceEstimate:{cashUsd:0,workUnits:3,networkBytes:0},
    readback:async({result})=>({ok:result.done===true,evidence:'independent result check'}),
    adapter:{id:'local',privacy:'local',capabilities:['document.render'],estimate:async()=>0,
      execute:async()=>{executions++;return {done:true}}}};
  const plan=await foundry.planEffectSubstrate(capsule,[route]);
  assert.equal(plan.selected.id,'local-transform');
  assert.equal(builds,0);
  assert.equal(executions,0);
  const result=await executeSubstratePlan(plan);
  assert.equal(result.status,'VERIFIED');
  assert.equal(executions,1);
});


test('CapabilityFoundry composes local primitives before routing an effect',async()=>{
  const foundry=new CapabilityFoundry();
  const readback=async({result})=>({ok:result.value==='DONE:sample',evidence:'test output readback'});
  const composed=foundry.composeEffectSubstrates({capability:'document.render',sourceType:'input',targetType:'report',
    input:'sample',readback,primitives:[
      {id:'render',from:'input',to:'report',pure:true,privacy:'local',quality:'exact',
        provenance:'owned-renderer',resourceEstimate:{cashUsd:0,workUnits:2,networkBytes:0},
        apply:async x=>'DONE:'+x}
    ]});
  const capsule=makeEffectCapsule({id:'composed:1',intent:'Produce local report',capability:'document.render',maxCostUsd:0});
  const plan=await foundry.planEffectSubstrate(capsule,composed.routes);
  assert.equal(plan.selected.method,'deterministic');
  const result=await executeSubstratePlan(plan);
  assert.equal(result.status,'VERIFIED');
});
