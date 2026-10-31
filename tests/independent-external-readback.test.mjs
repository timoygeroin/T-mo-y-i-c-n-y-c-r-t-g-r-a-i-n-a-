import test from 'node:test';
import assert from 'node:assert/strict';
import { MondayRuntime } from '../src/runtime.mjs';

const action = {
  id:'effect:one', objectiveId:'objective:one', domain:'code',
  sourceSignal:'signal:one', requiredVerificationMode:'external-exact-readback'
};
const receptor = {
  execute: async () => ({ok:true,status:'COMPLETED'}),
  verify: async () => ({
    ok:true,mode:'external-exact-readback',evidenceRef:'self-asserted-receipt'
  })
};
const runtime = independentReadback => new MondayRuntime({
  capabilities:{code:receptor},independentReadback
});

test('self-verification cannot be called independent effect proof',async()=>{
  const out=await runtime(null).executeAction(action);
  assert.equal(out.ok,false);
  assert.equal(out.verification.code,'INDEPENDENT_READBACK_READER_MISSING');
  assert.equal(out.ledger.state,'AMBIGUOUS');
});

test('host reader rejects a different effect even when receptor reports success',async()=>{
  const out=await runtime(async()=>({
    ok:true,effectId:'effect:someone-else',domain:'code',
    sourceSignal:'signal:one',evidenceRef:'host:another'
  })).executeAction(action);
  assert.equal(out.ok,false);
  assert.equal(out.verification.code,'INDEPENDENT_READBACK_EFFECT_MISMATCH');
});

test('exact host-side witness can promote an effect to VERIFIED and COMMITTED',async()=>{
  const out=await runtime(async({action:requested})=>({
    ok:true,effectId:requested.id,domain:requested.domain,
    sourceSignal:requested.sourceSignal,evidenceRef:'host:observed-effect'
  })).executeAction(action);
  assert.equal(out.ok,true);
  assert.equal(out.ledger.state,'COMMITTED');
  assert.equal(out.verification.independentProof.source,'HOST_READER');
  assert.equal(out.verification.independentProof.evidenceRef,'host:observed-effect');
});

test('legacy actions without external requirement retain existing behavior',async()=>{
  const out=await runtime(null).executeAction({...action,requiredVerificationMode:null});
  assert.equal(out.ok,true);
});
