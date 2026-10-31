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


test('missing action provenance cannot be laundered by a reader',async()=>{
  const bad={...action,sourceSignal:null};
  const out=await runtime(async({action:a})=>({
    ok:true,effectId:a.id,domain:a.domain,
    sourceSignal:a.sourceSignal,evidenceRef:'host:unbound'
  })).executeAction(bad);
  assert.equal(out.ok,false);
  assert.equal(out.verification.code,'INDEPENDENT_READBACK_EFFECT_MISMATCH');
});

test('independent reader must observe a real disk effect, not executor self-report', async()=>{
  const fs=await import('node:fs/promises');
  const os=await import('node:os');
  const path=await import('node:path');
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'monday-readback-'));
  const effect=path.join(dir,'effect.json');
  const reader=async({action:requested})=>{
    try {
      const observed=JSON.parse(await fs.readFile(effect,'utf8'));
      return observed.effectId===requested.id &&
        observed.domain===requested.domain &&
        observed.sourceSignal===requested.sourceSignal
        ? {ok:true,effectId:observed.effectId,domain:observed.domain,
          sourceSignal:observed.sourceSignal,evidenceRef:'fs:'+effect}
        : {ok:false};
    }catch{return {ok:false};}
  };
  try {
    const missing=await runtime(reader).executeAction(action);
    assert.equal(missing.ok,false);
    assert.equal(missing.ledger.state,'AMBIGUOUS');

    await fs.writeFile(effect,JSON.stringify({
      effectId:'wrong-id',domain:action.domain,sourceSignal:action.sourceSignal
    }));
    const wrong=await runtime(reader).executeAction(action);
    assert.equal(wrong.ok,false);

    await fs.writeFile(effect,JSON.stringify({
      effectId:action.id,domain:action.domain,sourceSignal:action.sourceSignal
    }));
    const observed=await runtime(reader).executeAction(action);
    assert.equal(observed.ok,true);
    assert.equal(observed.verification.independentProof.source,'HOST_READER');
  } finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
});
