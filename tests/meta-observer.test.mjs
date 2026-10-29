import test from 'node:test';
import assert from 'node:assert/strict';
import { compileMetaObservation } from '../src/meta-observer.mjs';
import { MondayRuntime } from '../src/runtime.mjs';
import { renderHumanSurface } from '../src/interface.mjs';

const WHOLE=['continuity','host','code','vision','research','integration'];
const ask={id:'meta-whole',text:'Пересобери всю систему MondayID'};
const receptor=(domain,withProof)=>({
  name:'receptor-'+domain,
  execute:async()=>({ok:true,verified:true,receipt:'self-claimed'}),
  verify:async()=>withProof
    ? {ok:true,mode:'external-exact-readback',evidenceRef:'verified-effect:'+domain}
    : {ok:true}
});

test('meta observer distinguishes WANT, executable CAN, and independently evidenced KNOW',()=>{
  const report=compileMetaObservation({
    intents:{'meta-whole':{id:'meta-whole',status:'active',amplification:{scope:'WHOLE_ORGANISM'},
      domains:WHOLE,obligations:WHOLE.map(domain=>({id:'o:'+domain,domain,status:'OPEN',material:true}))}},
    frontier:{ready:[{domain:'host',receptor:'host-live'}],
      blocked:[{domain:'integration',blocker:'NO_RECEPTOR:integration'}]},
    results:[{action:{domain:'host'},result:{ok:true,verified:true,receipt:'self'},verification:{ok:false,code:'NO_READBACK'},ok:false}]
  });
  assert.equal(report.state,'HOLD');
  assert.equal(report.filters.want.length,6);
  assert.deepEqual(report.filters.can,['host']);
  assert.deepEqual(report.filters.know,[]);
  assert.ok(report.gaps.some(x=>x.domain==='integration'));
  assert.ok(report.predictionErrors.some(x=>x.code==='SELF_CLAIM_WITHOUT_READBACK'));
  assert.equal(report.consciousnessClaim,false);
});

test('whole-organism action rejects a verifier that asserts success without a traceable effect receipt',async()=>{
  const caps=Object.fromEntries(WHOLE.map(domain=>[domain,receptor(domain,false)]));
  const runtime=new MondayRuntime({capabilities:caps});
  const pass=await runtime.runPass([ask],{maxCycles:2});
  assert.equal(pass.state,'BLOCKED');
  assert.equal(pass.cycles[0].results.length,6);
  assert.ok(pass.cycles[0].results.every(x=>!x.ok && x.verification.code==='META_EFFECT_RECEIPT_MISSING'));
  assert.ok(pass.final.results.every(x=>!x.ok),'no later cycle may promote an ambiguous effect');
  assert.equal(pass.final.intents['meta-whole'].status,'active');
  assert.equal(pass.final.meta.state,'HOLD');
});

test('valid six-domain evidence closes one whole-organism intent only after independent integration proof',async()=>{
  const caps=Object.fromEntries(WHOLE.map(domain=>[domain,receptor(domain,true)]));
  const runtime=new MondayRuntime({capabilities:caps});
  const pass=await runtime.runPass([ask],{maxCycles:2});
  assert.equal(pass.state,'FULFILLED');
  assert.equal(pass.final.meta.state,'VERIFIED');
  assert.deepEqual(pass.final.meta.filters.know,WHOLE);
  assert.equal(pass.final.meta.integrated,true);
  assert.equal(pass.final.intents['meta-whole'].status,'fulfilled');
});

test('integration verification must match the required exact external mode',async()=>{
  const caps=Object.fromEntries(WHOLE.map(domain=>[domain,receptor(domain,true)]));
  caps.integration.verify=async()=>({ok:true,mode:'local-test',evidenceRef:'unit-pass:integration'});
  const pass=await new MondayRuntime({capabilities:caps}).runPass([ask],{maxCycles:2});
  assert.equal(pass.state,'BLOCKED');
  assert.equal(pass.final.meta.integrated,false);
  assert.ok(pass.final.meta.gaps.some(x=>x.domain==='integration'));
});

test('a vacuous status object cannot be shown as verified system work',()=>{
  const view=renderHumanSurface({ok:true,results:[],frontier:{blocked:[]},intents:{},revision:'x'});
  assert.notEqual(view.state,'VERIFIED');
});

test('ordinary narrow task keeps existing verification semantics',async()=>{
  const pass=await new MondayRuntime({capabilities:{
    general:{name:'general',execute:async()=>({ok:true}),verify:async()=>({ok:true})}
  }}).runPass([{id:'narrow',text:'say hello'}],{maxCycles:2});
  assert.equal(pass.state,'FULFILLED');
  assert.equal(pass.final.meta.state,'TASK_LOCAL');
});
