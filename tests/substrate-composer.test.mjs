import test from 'node:test';
import assert from 'node:assert/strict';
import { composePrimitiveRoutes } from '../src/substrate-composer.mjs';
import { makeEffectCapsule } from '../src/effect-abi.mjs';
import { planSubstrates, executeSubstratePlan } from '../src/substrate-optimizer.mjs';

const capsule=()=>makeEffectCapsule({id:'render:plain',intent:'Transform source',capability:'document.render',privacy:'local',maxCostUsd:0});
const p=(id,from,to,apply,workUnits=1,quality='exact')=>({id,from,to,pure:true,privacy:'local',apply,quality,provenance:'owner-source:'+id,resourceEstimate:{cashUsd:0,workUnits,networkBytes:0}});
const readback=async({result})=>({ok:result.value==='OK:hello',evidence:'verified output bytes'});

test('local primitive composition obtains an effect no individual primitive provides',async()=>{
  const steps=[p('strip','raw','plain',x=>String(x).trim()),p('format','plain','report',x=>'OK:'+x)];
  const out=composePrimitiveRoutes({capability:'document.render',sourceType:'raw',targetType:'report',input:' hello ',primitives:steps,readback});
  assert.equal(out.routes.length,1);
  assert.equal(out.routes[0].method,'deterministic');
  const plan=await planSubstrates(capsule(),out.routes);
  assert.equal(plan.status,'READY');
  assert.equal((await executeSubstratePlan(plan)).status,'VERIFIED');
});

test('optimizer chooses lower work strategy even with more composition stages',async()=>{
  const routes=composePrimitiveRoutes({capability:'document.render',sourceType:'a',targetType:'z',input:'hello',primitives:[
    p('costly','a','z',x=>'OK:'+x,20),p('a-b','a','b',x=>x,1),p('b-z','b','z',x=>'OK:'+x,1)
  ],readback});
  assert.equal(routes.routes.length,2);
  const plan=await planSubstrates(capsule(),routes.routes);
  assert.equal(plan.selected.profile.workUnits,2);
  assert.equal((await executeSubstratePlan(plan)).status,'VERIFIED');
});

test('untrusted or unestimated primitive cannot be compiled into fake free compute',()=>{
  const bad=p('blackbox','a','b',x=>x);delete bad.resourceEstimate;
  const untrusted=p('unsafe','a','b',x=>x);untrusted.pure=false;
  const out=composePrimitiveRoutes({capability:'document.render',sourceType:'a',targetType:'b',input:'a',primitives:[bad,untrusted],readback});
  assert.equal(out.routes.length,0);
  assert.ok(out.rejections.some(x=>x.id==='blackbox'&&x.code==='UNKNOWN_RESOURCES'));
  assert.ok(out.rejections.some(x=>x.id==='unsafe'&&x.code==='UNTRUSTED_PRIMITIVE'));
});

test('composition avoids cyclic and unbounded routes',()=>{
  const prim=[p('a-b','a','b',x=>x),p('b-a','b','a',x=>x),p('b-c','b','c',x=>x)];
  const out=composePrimitiveRoutes({capability:'document.render',sourceType:'a',targetType:'c',input:'a',primitives:prim,readback,maxStages:3});
  assert.equal(out.routes.length,1);
  assert.deepEqual(out.routes[0].stages,['a-b','b-c']);
});

test('approximate steps propagate approximation and require explicit opt-in',async()=>{
  const out=composePrimitiveRoutes({capability:'document.render',sourceType:'raw',targetType:'report',input:'hello',primitives:[
    p('summarize','raw','plain',x=>x,1,'approximate'),p('format','plain','report',x=>'OK:'+x)
  ],readback});
  assert.equal(out.routes[0].quality,'approximate');
  const rejected=await planSubstrates(capsule(),out.routes);
  assert.equal(rejected.status,'BLOCKED');
  const allowed=await planSubstrates(capsule(),out.routes,{allowApproximate:true});
  assert.equal(allowed.status,'READY');
  assert.equal((await executeSubstratePlan(allowed)).status,'VERIFIED');
});

test('missing chain stays unavailable instead of inventing a model',()=>{
  const out=composePrimitiveRoutes({capability:'document.render',sourceType:'raw',targetType:'image',input:'hello',primitives:[p('normalize','raw','plain',x=>x)],readback});
  assert.deepEqual(out.routes,[]);
  assert.equal(out.code,'NO_COMPOSITION');
});
