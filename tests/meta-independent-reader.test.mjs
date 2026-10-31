import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MondayRuntime } from '../src/runtime.mjs';

const domains=['continuity','host','code','vision','research','integration'];
const signal={id:'owner-whole-independent',text:'Пересобери всю систему MondayID'};

async function withWorld(run){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'monday-independent-'));
  try {
    const independentReadback=async({action})=>{
      // Read the filesystem directly. Never trust the receptor's result fields
      // as proof that its claimed write actually happened.
      try {
        const body=JSON.parse(await fs.readFile(path.join(dir,action.domain+'.json'),'utf8'));
        if(body.effectId!==action.id || body.domain!==action.domain ||
           body.sourceSignal!==action.sourceSignal) return {ok:false};
        return {
          ok:true,effectId:body.effectId,domain:body.domain,
          sourceSignal:body.sourceSignal,
          evidenceRef:'fs-readback:'+action.domain+':'+body.effectId
        };
      } catch { return {ok:false}; }
    };
    const capabilities=Object.fromEntries(domains.map(domain=>[domain,{
      name:'fixture:'+domain,
      execute:async action=>{
        if(run==='WRITE'){
          await fs.writeFile(path.join(dir,domain+'.json'),JSON.stringify({
            effectId:action.id,domain,sourceSignal:action.sourceSignal
          }));
        } else if(run==='WRONG'){
          await fs.writeFile(path.join(dir,domain+'.json'),JSON.stringify({
            effectId:action.id+':different',domain,sourceSignal:action.sourceSignal
          }));
        }
        return {ok:true,status:'COMPLETED',receipt:'self-claimed'};
      },
      verify:async()=>({
        ok:true,mode:'external-exact-readback',
        evidenceRef:'executor-claims-'+domain
      })
    }]));
    const runtime=new MondayRuntime({capabilities,independentReadback});
    return await runtime.runPass([signal],{maxCycles:2});
  } finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
}

test('real host-side readback can independently witness each concrete effect',async()=>{
  const out=await withWorld('WRITE');
  assert.equal(out.state,'FULFILLED');
  assert.equal(out.final.meta.state,'VERIFIED');
  assert.deepEqual(out.final.meta.filters.know,domains);
  assert.ok(out.cycles[0].results.every(r=>r.verification.independentProof?.source==='HOST_READER'));
});

test('plausible no-op executor plus enthusiastic self-verification fails the same gate',async()=>{
  const out=await withWorld('NO_OP');
  assert.equal(out.state,'BLOCKED');
  assert.equal(out.final.meta.state,'HOLD');
  assert.deepEqual(out.final.meta.filters.know,[]);
  assert.ok(out.cycles[0].results.every(r=>r.verification.code==='META_INDEPENDENT_EFFECT_MISMATCH'));
});

test('stale files for other effect IDs cannot be used as witness for current action',async()=>{
  const out=await withWorld('WRONG');
  assert.equal(out.state,'BLOCKED');
  assert.equal(out.final.meta.state,'HOLD');
  assert.deepEqual(out.final.meta.filters.know,[]);
  assert.ok(out.cycles[0].results.every(r=>r.verification.code==='META_INDEPENDENT_EFFECT_MISMATCH'));
});
