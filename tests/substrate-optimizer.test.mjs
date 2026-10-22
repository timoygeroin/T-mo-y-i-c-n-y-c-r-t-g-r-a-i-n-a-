import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEffectCapsule } from '../src/effect-abi.mjs';
import { planSubstrates, executeSubstratePlan } from '../src/substrate-optimizer.mjs';

const capsule = () => makeEffectCapsule({id:'task:render:1',intent:'Create a reusable report',capability:'document.render',privacy:'local',maxCostUsd:0,sideEffect:'local'});
const route = (id,method,options={}) => {
  const calls={execute:0,estimate:0,verify:0};
  const adapter={
    id, privacy:options.privacy||'local',capabilities:options.capabilities||['document.render'],
    async estimate(){calls.estimate++;return options.usd??0},
    async execute(c){calls.execute++;if(options.fail)throw Error('ambiguous execution');return {value:id,text:c.intent}}
  };
  return {id,method,adapter,scopeDigest:options.scopeDigest,provenance:options.provenance||'test-owned',
    quality:options.quality||'exact',resourceEstimate:{cashUsd:options.usd??0,workUnits:options.workUnits??10,networkBytes:options.networkBytes??0},
    readback:async({result})=>{calls.verify++;return {ok:options.unverified?false:result.value===id,evidence:'read independently'}},
    probe:options.probe||(method==='reuse'?async()=>({ok:true,evidence:'artifact observed'}):undefined),calls};
};

test('identify exact zero-cash reused output before recomputing and executing model',async()=>{
  const c=capsule(),cached=route('local-cache','reuse',{scopeDigest:c.digest,workUnits:1});
  const model=route('local-model','local-model',{workUnits:500});
  const plan=await planSubstrates(c,[model,cached]);
  assert.equal(plan.status,'READY');
  assert.equal(plan.selected.id,'local-cache');
  assert.equal(cached.calls.execute,0);
  assert.equal(model.calls.execute,0);
  const r=await executeSubstratePlan(plan);
  assert.equal(r.status,'VERIFIED');
  assert.equal(cached.calls.execute,1);
  assert.equal(model.calls.execute,0);
  assert.equal(r.method,'reuse');
});

test('stale cache cannot pretend to match another input; deterministic work wins',async()=>{
  const c=capsule();const stale=route('stale','reuse',{scopeDigest:'wrong',workUnits:0});
  const transform=route('pure-transform','deterministic',{workUnits:5});
  const cloud=route('cloud','delegated',{privacy:'delegated',workUnits:1});
  const p=await planSubstrates(c,[stale,cloud,transform]);
  assert.equal(p.selected.id,'pure-transform');
  assert.ok(p.rejections.some(x=>x.id==='stale'&&x.code==='STALE_REUSE'));
  assert.ok(p.rejections.some(x=>x.id==='cloud'&&x.code==='PRIVACY_BOUNDARY'));
});

test('if only real paid path exists, do not claim that free compute exists',async()=>{
  const paid=route('gpu','delegated',{privacy:'delegated',usd:2});
  const p=await planSubstrates(capsule(),[paid]);
  assert.equal(p.status,'BLOCKED');
  assert.equal(p.code,'NO_ADMISSIBLE_SUBSTRATE');
  assert.equal(paid.calls.execute,0);
});

test('unknown cost and unknown resources are not classified as free',async()=>{
  const unknown=route('unmeasured','deterministic');unknown.resourceEstimate=null;
  const p=await planSubstrates(capsule(),[unknown]);
  assert.equal(p.status,'BLOCKED');
  assert.equal(p.rejections[0].code,'UNKNOWN_RESOURCE_PROFILE');
});

test('equivalence must be exact unless explicitly permitted and then independently verified',async()=>{
  const approximate=route('quick-summary','deterministic',{quality:'approximate',workUnits:1});
  let p=await planSubstrates(capsule(),[approximate]);
  assert.equal(p.status,'BLOCKED');
  assert.equal(p.rejections[0].code,'QUALITY_UNVERIFIED');
  p=await planSubstrates(capsule(),[approximate],{allowApproximate:true});
  assert.equal(p.status,'READY');
  assert.equal((await executeSubstratePlan(p)).status,'VERIFIED');
});

test('if unverified after execution, no silent fallback or duplicate side effect',async()=>{
  const primary=route('primary','deterministic',{workUnits:1,unverified:true});
  const alternate=route('alternate','deterministic',{workUnits:2});
  const p=await planSubstrates(capsule(),[primary,alternate]);
  const r=await executeSubstratePlan(p);
  assert.equal(r.status,'UNVERIFIED');
  assert.equal(primary.calls.execute,1);
  assert.equal(alternate.calls.execute,0);
});

test('cloud and external effects cannot route around human authorization',async()=>{
  const external=makeEffectCapsule({id:'publish-1',intent:'Publish document',capability:'document.render',privacy:'delegated',maxCostUsd:0,sideEffect:'external'});
  const cloud=route('third-party','delegated',{privacy:'delegated'});
  const p=await planSubstrates(external,[cloud]);
  assert.equal(p.status,'READY');
  const denied=await executeSubstratePlan(p);
  assert.equal(denied.code,'AUTHORIZATION_REQUIRED');
  assert.equal(cloud.calls.execute,0);
  const ok=await executeSubstratePlan(p,{authorize:async()=>true});
  assert.equal(ok.status,'VERIFIED');
});

test('unverified provenance and caps from a different model are rejected',async()=>{
  const noProvenance=route('unsupported','local-model',{provenance:''});noProvenance.provenance='';
  const wrong=route('wrong','deterministic',{capabilities:['image.generate']});
  const p=await planSubstrates(capsule(),[noProvenance,wrong]);
  assert.equal(p.status,'BLOCKED');
  assert.equal(p.rejections.length,2);
});

test('malformed or tampered capsule refuses all routes before planning',async()=>{
  const c={...capsule(),intent:'Now send money'};
  const a=route('available','deterministic');
  const p=await planSubstrates(c,[a]);
  assert.equal(p.status,'BLOCKED');
  assert.equal(p.code,'INVALID_CAPSULE');
  assert.equal(a.calls.estimate,0);
});

test('planner requires independent readback callback and does not execute on estimates',async()=>{
  const noReadback=route('unverified-route','deterministic');delete noReadback.readback;
  const p=await planSubstrates(capsule(),[noReadback]);
  assert.equal(p.status,'BLOCKED');
  assert.equal(p.rejections[0].code,'READBACK_REQUIRED');
  assert.equal(noReadback.calls.execute,0);
});

test('missing cached artifact is rejected before selection so deterministic equivalent can run',async()=>{
  const c=capsule();const gone=route('gone','reuse',{scopeDigest:c.digest,workUnits:0,probe:async()=>({ok:false})});
  const fallback=route('fallback','deterministic',{workUnits:5});
  const p=await planSubstrates(c,[gone,fallback]);
  assert.equal(p.selected.id,'fallback');
  assert.ok(p.rejections.some(r=>r.id==='gone'&&r.code==='REUSE_PROOF_MISSING'));
});

test('reuse without a current observable artifact cannot advertise zero-compute success',async()=>{
  const c=capsule(),r=route('no-proof','reuse',{scopeDigest:c.digest,workUnits:0});delete r.probe;
  const p=await planSubstrates(c,[r]);
  assert.equal(p.status,'BLOCKED');
  assert.equal(p.rejections[0].code,'REUSE_PROOF_REQUIRED');
});

test('stale proof after planning blocks execution without retrying or pretending verified',async()=>{
  let checks=0;const c=capsule(),r=route('vanishing','reuse',{scopeDigest:c.digest,workUnits:0,probe:async()=>({ok:++checks===1,evidence:'disk check'})});
  const p=await planSubstrates(c,[r]);assert.equal(p.status,'READY');
  const receipt=await executeSubstratePlan(p);
  assert.equal(receipt.status,'BLOCKED');
  assert.equal(receipt.code,'REUSE_PROOF_STALE');
  assert.equal(r.calls.execute,0);
});

test('mutated route between planning and execution is rejected',async()=>{
  const c=capsule(),r=route('local','deterministic');
  const p=await planSubstrates(c,[r]);
  r.adapter.id='swapped-vendor';
  const receipt=await executeSubstratePlan(p);
  assert.equal(receipt.code,'PLAN_ROUTE_CHANGED');
  assert.equal(r.calls.execute,0);
});

test('approximate output is not authorized by mutating route after exact-only planning',async()=>{
  const c=capsule(),r=route('exact','deterministic');
  const p=await planSubstrates(c,[r]);
  r.quality='approximate';
  const receipt=await executeSubstratePlan(p);
  assert.equal(receipt.code,'QUALITY_UNVERIFIED');
  assert.equal(r.calls.execute,0);
});
