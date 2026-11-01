import test from 'node:test';
import assert from 'node:assert/strict';
import { runChatHost } from '../src/chat-host-adapter.mjs';

const snapshot={schema:'mondayid.worldline.snapshot.v0.4.0',
  trust:'AUTHENTICATED_MACHINE_WRITER',readOnly:true,generatedAtIso:'2026-09-24T00:00:00Z',
  events:[],conflictProbe:{conflicts:[]}};
const fetchImpl=async()=>({ok:true,status:200,json:async()=>snapshot});
const env={MONDAYID_MODEL_EXECUTION_ENABLED:'true',MONDAYID_API_SPEND_ENABLED:'true',
  MONDAYID_MAX_OUTPUT_TOKENS:'512',MONDAYID_MAX_INPUT_CHARS:'12000',
  MONDAYID_MAX_PARALLEL_PATHS:'2',MONDAYID_MAX_CRITICS:'1',
  MONDAYID_WORLDLINE_URL:'https://worldline.test'};

test('a material change order cannot ship as model-only prose',async()=>{
  const provider={async generate(){return {ok:true,text:'Все мутации применены.'};}};
  const result=await runChatHost({signal:{id:'material-veto-1',
    text:'Измени всю систему MondayID',computeTier:'LOW'},env,fetchImpl,provider});
  assert.equal(result.ok,false);
  assert.equal(result.surface.released,false);
  assert.equal(result.behavior.preflight.selectedFamily,'MATERIAL_EXECUTION');
  assert.equal(result.behavior.gate.code,'MATERIAL_ORDER_EFFECT_UNVERIFIED');
  assert.equal(result.completionProof.code,'MATERIAL_OBLIGATIONS_UNSPECIFIED');
});

test('an exact independently witnessed change can pass for material order',async()=>{
  const domain={name:'trusted-domain',
    async execute(){return {ok:true,text:'External target changed.'};},
    async verify(){return {ok:true,mode:'external-exact-readback',evidenceRef:'provider:one'};}};
  const signal={id:'material-proof-1',text:'Измени систему MondayID',materialOrder:true,
    requireDomainReceptor:true,computeTier:'LOW',
    obligations:[{binding:'obligation',id:'one',domain:'general',status:'OPEN',
      effect:'Observe a bounded target change',requiredVerificationMode:'external-exact-readback'}]};
  const result=await runChatHost({signal,env,fetchImpl,
    provider:{async generate(){throw Error('model output must not substitute');}},
    domainReceptors:{general:domain},
    async independentReadback({action}){return {ok:true,effectId:action.id,
      domain:action.domain,sourceSignal:action.sourceSignal,
      evidenceRef:'external:readback:one',effectObserved:true,noOpControlPassed:false};}
  });
  assert.equal(result.ok,true);
  assert.equal(result.completionProof.verified,true);
  assert.deepEqual([...result.completionProof.evidenceRefs],['external:readback:one']);
});

test('no-op readback cannot pass a material order',async()=>{
  const domain={name:'trusted-domain',
    async execute(){return {ok:true,text:'External target unchanged.'};},
    async verify(){return {ok:true,mode:'external-exact-readback',evidenceRef:'provider:one'};}};
  const signal={id:'material-noop-1',text:'Измени систему MondayID',materialOrder:true,
    requireDomainReceptor:true,computeTier:'LOW',
    obligations:[{binding:'obligation',id:'one',domain:'general',status:'OPEN',
      effect:'Observe a bounded target change',requiredVerificationMode:'external-exact-readback'}]};
  const result=await runChatHost({signal,env,fetchImpl,
    provider:{async generate(){throw Error('model output must not substitute');}},
    domainReceptors:{general:domain},
    async independentReadback({action}){return {ok:true,effectId:action.id,
      domain:action.domain,sourceSignal:action.sourceSignal,
      evidenceRef:'external:readback:no-op',effectObserved:false,noOpControlPassed:true};}
  });
  assert.equal(result.ok,false);
  assert.equal(result.behavior.gate.code,'MATERIAL_ORDER_EFFECT_UNVERIFIED');
});
