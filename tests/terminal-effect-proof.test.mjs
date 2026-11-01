import test from 'node:test';
import assert from 'node:assert/strict';
import { assessTerminalEffectProof } from '../src/terminal-effect-proof.mjs';

const signal={
  id:'owner:release-1',finishOnly:true,
  obligations:[
    {id:'host',domain:'host',binding:'obligation',status:'OPEN'},
    {id:'code',domain:'code',binding:'obligation',status:'OPEN'}
  ]
};
function witnessed(obligation,{effect='ok',readback=true,committed=true}={}) {
  const action={
    id:`action:owner:release-1:${obligation.domain}:obligation:${obligation.id}`,
    domain:obligation.domain,obligationId:obligation.id,sourceSignal:signal.id
  };
  return {
    action,ok:effect==='ok',
    ledger:{state:committed?'COMMITTED':'AMBIGUOUS'},
    verification:{ok:effect==='ok',mode:'external-exact-readback',evidenceRef:'provider:'+obligation.id,
      independentProof:readback?{
        source:'HOST_READER',effectId:action.id,domain:action.domain,
        sourceSignal:action.sourceSignal,evidenceRef:'reader:'+obligation.id
      }:null}
  };
}
const passFor=results=>({ok:true,state:'FULFILLED',final:{results,meta:{state:'VERIFIED'}}});
const surface={released:true,message:'All material work complete.'};
test('complete two-obligation independently observed pass releases terminal proof',()=>{
  const proof=assessTerminalEffectProof({signal,pass:passFor(signal.obligations.map(o=>witnessed(o))),surface});
  assert.equal(proof.verified,true);
  assert.deepEqual([...proof.evidenceRefs],['reader:host','reader:code']);
});
test('a partial pass, even with one real receipt, cannot be claimed complete',()=>{
  const proof=assessTerminalEffectProof({signal,pass:passFor([witnessed(signal.obligations[0])]),surface});
  assert.equal(proof.verified,false);
  assert.equal(proof.code,'MATERIAL_EFFECT_READBACK_MISSING');
});
test('self-certified provider receipt without independent reader is rejected',()=>{
  const proof=assessTerminalEffectProof({signal,pass:passFor(signal.obligations.map(o=>witnessed(o,{readback:false}))),surface});
  assert.equal(proof.verified,false);
});
test('uncommitted and mismatched effect receipts cannot pass',()=>{
  const results=signal.obligations.map(o=>witnessed(o));
  results[1].verification.independentProof.domain='host';
  assert.equal(assessTerminalEffectProof({signal,pass:passFor(results),surface}).verified,false);
  const second=signal.obligations.map(o=>witnessed(o));
  second[0].ledger.state='AMBIGUOUS';
  assert.equal(assessTerminalEffectProof({signal,pass:passFor(second),surface}).verified,false);
});
test('a verbal completion without explicit material obligations cannot pass',()=>{
  assert.equal(assessTerminalEffectProof({signal:{id:'x'},pass:passFor([]),surface}).code,
    'MATERIAL_OBLIGATIONS_UNSPECIFIED');
});
test('unfinished runtime and unreleased model text cannot unlock proof',()=>{
  const results=signal.obligations.map(o=>witnessed(o));
  assert.equal(assessTerminalEffectProof({signal,pass:{...passFor(results),state:'BLOCKED'},surface}).verified,false);
  assert.equal(assessTerminalEffectProof({signal,pass:passFor(results),surface:{released:false}}).verified,false);
});


test('material order requires observed target delta and a passing negative control',()=>{
  const material={...signal,requireObservableDelta:true};
  const missing=signal.obligations.map(o=>witnessed(o));
  assert.equal(assessTerminalEffectProof({signal:material,pass:passFor(missing),surface}).verified,false);
  const present=signal.obligations.map(o=>witnessed(o));
  for(const r of present){
    r.verification.independentProof.effectObserved=true;
    r.verification.independentProof.noOpControlPassed=false;
  }
  const proved=assessTerminalEffectProof({signal:material,pass:passFor(present),surface});
  assert.equal(proved.verified,true);
  assert.equal(proved.evidenceRefs.length,2);
  present[0].verification.independentProof.noOpControlPassed=true;
  assert.equal(assessTerminalEffectProof({signal:material,pass:passFor(present),surface}).verified,false);
});
