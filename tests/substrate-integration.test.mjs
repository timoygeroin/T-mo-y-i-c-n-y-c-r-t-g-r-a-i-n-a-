import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { makeEffectCapsule } from '../src/effect-abi.mjs';
import { planSubstrates, executeSubstratePlan } from '../src/substrate-optimizer.mjs';

const hash = s => createHash('sha256').update(s).digest('hex');

test('real filesystem: calculate locally, reuse exact artifact, and invalidate corrupted artifact',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'monday-substrate-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const target=path.join(dir,'report.txt');
  const manifest=path.join(dir,'report.meta.json');
  const capsule=makeEffectCapsule({id:'report:2026-10-22',intent:'Plain verified result',capability:'document.render',privacy:'local',maxCostUsd:0,sideEffect:'local'});
  const expected='Report\n'+capsule.intent+'\n';
  let calculated=0,reused=0,modelCalled=0;
  const verify=async()=>{
    const actual=await readFile(target,'utf8');
    return {ok:actual===expected,evidence:actual===expected?'filesystem readback '+hash(actual):'mismatch'};
  };
  async function cacheProbe(){try{
    const entry=JSON.parse(await readFile(manifest,'utf8'));
    const actual=await readFile(target,'utf8');
    const valid=entry.inputDigest===capsule.digest&&entry.contentDigest===hash(actual)&&actual===expected;
    return {ok:valid,evidence:valid?'filesystem cache receipt':''};
  }catch{return {ok:false}}}
  const reuse={id:'cached-artifact',method:'reuse',scopeDigest:capsule.digest,provenance:'owner-filesystem-manifest',quality:'exact',
    resourceEstimate:{cashUsd:0,workUnits:1,networkBytes:0},probe:cacheProbe,readback:verify,
    adapter:{id:'local-fs-reader',privacy:'local',capabilities:['document.render'],estimate:async()=>0,
      execute:async()=>{reused++;return {file:await readFile(target,'utf8')}}}};
  const deterministic={id:'local-formatting',method:'deterministic',provenance:'explicit-deterministic-code',quality:'exact',
    resourceEstimate:{cashUsd:0,workUnits:10,networkBytes:0},readback:verify,
    adapter:{id:'local-fs-writer',privacy:'local',capabilities:['document.render'],estimate:async()=>0,
      execute:async()=>{calculated++;await writeFile(target,expected);
        await writeFile(manifest,JSON.stringify({inputDigest:capsule.digest,contentDigest:hash(expected)}));return {file:target}}}};
  const model={id:'not-needed',method:'local-model',provenance:'simulated-model',quality:'exact',
    resourceEstimate:{cashUsd:0,workUnits:1000,networkBytes:0},readback:verify,
    adapter:{id:'model',privacy:'local',capabilities:['document.render'],estimate:async()=>0,execute:async()=>{modelCalled++;return {}}}};
  let plan=await planSubstrates(capsule,[reuse,deterministic,model]);
  assert.equal(plan.selected.method,'deterministic');
  assert.equal((await executeSubstratePlan(plan)).status,'VERIFIED');
  assert.equal(calculated,1);
  plan=await planSubstrates(capsule,[reuse,deterministic,model]);
  assert.equal(plan.selected.method,'reuse');
  assert.equal((await executeSubstratePlan(plan)).status,'VERIFIED');
  assert.equal(reused,1);
  assert.equal(calculated,1);
  await writeFile(target,'tampered result');
  plan=await planSubstrates(capsule,[reuse,deterministic,model]);
  assert.equal(plan.selected.method,'deterministic');
  assert.equal((await executeSubstratePlan(plan)).status,'VERIFIED');
  assert.equal(calculated,2);
  assert.equal(modelCalled,0);
});
