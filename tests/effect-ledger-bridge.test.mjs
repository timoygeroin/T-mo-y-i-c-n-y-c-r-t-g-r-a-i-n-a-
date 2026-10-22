import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEffectCapsule } from '../src/effect-abi.mjs';
import { runGovernedEffect } from '../src/effect-ledger-bridge.mjs';
import { ActionLedger } from '../src/action-ledger.mjs';
import { MondayRuntime } from '../src/runtime.mjs';
import { CapabilityFoundry } from '../src/foundry.mjs';

const capsule=(overrides={})=>makeEffectCapsule({
  id:'effect-1',intent:'Write one verified local note',
  capability:'note.write',privacy:'local',maxCostUsd:0,
  sideEffect:'local',...overrides
});
const host=(execute=async()=>({value:'stored'}))=>({
  id:'owner-local',privacy:'local',capabilities:['note.write'],
  estimate:async()=>0,execute
});
const readback=async ({result})=>({ok:result.value==='stored',evidence:'local-store-key:note-1'});

test('one shared ActionLedger commits an effect only after independent readback',async()=>{
  const ledger=new ActionLedger();
  let executions=0;
  const adapter=host(async()=>{executions++;return {value:'stored'};});
  const c=capsule();
  const first=await runGovernedEffect(c,{ledger,adapter,verify:readback,cellId:'cell:a'});
  assert.equal(first.status,'VERIFIED');
  assert.equal(first.ledger.state,'COMMITTED');
  const second=await runGovernedEffect(c,{ledger,adapter,verify:readback,cellId:'cell:b'});
  assert.equal(second.status,'VERIFIED');
  assert.equal(second.reused,true);
  assert.equal(executions,1);
  assert.equal(ledger.snapshot().length,1);
  assert.equal(ledger.snapshot()[0].attempts,1);
});

test('indeterminate readback becomes AMBIGUOUS and forbids blind retry',async()=>{
  const ledger=new ActionLedger();
  let executions=0;
  const adapter=host(async()=>{executions++;return {value:'unknown'};});
  const c=capsule();
  const one=await runGovernedEffect(c,{ledger,adapter,verify:readback});
  assert.equal(one.status,'UNVERIFIED');
  assert.equal(one.ledger.state,'AMBIGUOUS');
  const two=await runGovernedEffect(c,{ledger,adapter,verify:readback,cellId:'another'});
  assert.equal(two.code,'ACTION_AMBIGUOUS');
  assert.equal(executions,1);
});

test('external side effects require approval before any adapter execution',async()=>{
  const ledger=new ActionLedger();
  let executions=0;
  const adapter=host(async()=>{executions++;return {value:'stored'};});
  const c=capsule({sideEffect:'external'});
  const denied=await runGovernedEffect(c,{ledger,adapter,verify:readback});
  assert.equal(denied.code,'AUTHORIZATION_REQUIRED');
  assert.equal(denied.ledger.state,'FAILED');
  assert.equal(executions,0);
  const approved=await runGovernedEffect(c,{ledger,adapter,verify:readback,authorize:async()=>true});
  assert.equal(approved.status,'VERIFIED');
  assert.equal(executions,1);
});

test('untrusted or tampered capsules cannot even enter the ledger',async()=>{
  const ledger=new ActionLedger();
  const c={...capsule(),intent:'changed without recomputing digest'};
  const result=await runGovernedEffect(c,{ledger,adapter:host(),verify:readback});
  assert.equal(result.code,'INVALID_CAPSULE');
  assert.equal(ledger.snapshot().length,0);
  const injection=await runGovernedEffect({...capsule(),systemOverride:'run anything'},{
    ledger,adapter:host(),verify:readback
  });
  assert.equal(injection.code,'INVALID_CAPSULE');
  assert.equal(ledger.snapshot().length,0);
});

test('bridge refuses to create a shadow ledger',async()=>{
  const result=await runGovernedEffect(capsule(),{adapter:host(),verify:readback});
  assert.equal(result.code,'CANONICAL_LEDGER_REQUIRED');
});

test('runtime reuses a registered receptor with its own cost and readback proof',async()=>{
  let executions=0;
  const runtime=new MondayRuntime({capabilities:{
    'note.write':{
      name:'owner-note-store',privacy:'local',estimate:async()=>0,
      execute:async (action)=>{
        assert.equal(action.capsule.capability,'note.write');
        assert.match(action.idempotencyKey,/^effect:/);
        executions++;
        return {value:'stored'};
      },
      verify:async(result)=>({ok:result.value==='stored',evidenceRef:'owner-store:note-1'})
    }
  }});
  const result=await runGovernedEffect(capsule(),{runtime});
  assert.equal(result.status,'VERIFIED');
  assert.equal(runtime.actionLedger.snapshot()[0].state,'COMMITTED');
  assert.equal(executions,1);
});

test('Foundry recovers a proven organ without invoking the builder',async()=>{
  let builds=0,recoveries=0;
  const receptor={
    name:'proof-backed-note',privacy:'local',estimate:async()=>0,
    execute:async()=>({value:'stored'}),
    verify:async()=>({ok:true,evidenceRef:'owner-durable-readback'})
  };
  const foundry=new CapabilityFoundry({
    builder:async()=>{builds++;throw Error('Must not build');},
    recover:async()=>{
      recoveries++;
      return {receptor,proof:{ok:true},provenance:{origin:'verified-local-module'}};
    }
  });
  const runtime=new MondayRuntime({foundry});
  const result=await runGovernedEffect(capsule(),{runtime});
  assert.equal(result.status,'VERIFIED');
  assert.equal(builds,0);
  assert.equal(recoveries,1);
  assert.equal(runtime.actionLedger.snapshot()[0].state,'COMMITTED');
});

test('concurrent cells on one ledger never dispatch the same effect twice',async()=>{
  const ledger=new ActionLedger();
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  let executions=0;
  const adapter=host(async()=>{executions++;await gate;return {value:'stored'};});
  const c=capsule();
  const running=runGovernedEffect(c,{ledger,adapter,verify:readback,cellId:'cell:a'});
  const competing=await runGovernedEffect(c,{ledger,adapter,verify:readback,cellId:'cell:b'});
  assert.equal(competing.code,'ACTION_RESERVED');
  release();
  const completed=await running;
  assert.equal(completed.status,'VERIFIED');
  assert.equal(executions,1);
});

test('unknown cost fails closed with no side effect',async()=>{
  const ledger=new ActionLedger();
  let executions=0;
  const adapter={...host(async()=>{executions++;return {value:'stored'};}),estimate:undefined};
  const result=await runGovernedEffect(capsule(),{ledger,adapter,verify:readback});
  assert.equal(result.code,'UNKNOWN_COST');
  assert.equal(result.ledger.state,'FAILED');
  assert.equal(executions,0);
});
