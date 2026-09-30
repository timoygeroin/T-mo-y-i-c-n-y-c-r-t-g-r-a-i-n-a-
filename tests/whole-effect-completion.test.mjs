import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MondayRuntime } from '../src/runtime.mjs';
import { Worldline, hash } from '../src/worldline.mjs';
import { renderVerifiedCandidateSurface } from '../src/interface.mjs';

const wholeSignal = () => ({
  id:'whole', text:'complete the whole requested system', domains:['host'],
  obligations:[
    {id:'boot',domain:'host',text:'boot works'},
    {id:'native-chat',domain:'host',text:'native chat preserves corrections'}
  ]
});

test('one verified host operation cannot close a different obligation in the same domain', async () => {
  const runtime=new MondayRuntime({capabilities:{host:{
    name:'boot-only', supports:a=>a.effect==='boot works',
    execute:async()=>({ok:true,text:'boot works'}), verify:async()=>({ok:true})
  }}});
  const pass=await runtime.runPass([wholeSignal()]);
  assert.equal(pass.state,'BLOCKED');
  const intent=pass.final.intents.whole;
  assert.equal(intent.status,'active');
  assert.equal(intent.obligations[0].status,'APPLIED');
  assert.equal(intent.obligations[1].status,'OPEN');
  assert.deepEqual(intent.completedDomains,[]);
  assert.equal(renderVerifiedCandidateSurface(pass.final).released,false);
  assert.deepEqual(pass.final.state.tasks['task:whole'].openRemainder,['native-chat']);
});

test('generic answer verification cannot substitute for required effect readback', async () => {
  const runtime=new MondayRuntime({capabilities:{host:{
    name:'answer-only', execute:async()=>({ok:true,text:'everything is ready'}),
    verify:async()=>({ok:true,mode:'model-response'})
  }}});
  const signal=wholeSignal();
  signal.obligations.forEach(o=>{o.requiredVerificationMode='effect-readback';});
  const pass=await runtime.runPass([signal]);
  assert.equal(pass.state,'BLOCKED');
  assert.ok(pass.final.intents.whole.obligations.every(o=>o.status==='OPEN'));
  assert.ok(pass.cycles.some(c=>c.results.some(r=>r.verification.code==='REQUIRED_EFFECT_READBACK_MISSING')));
  assert.equal(renderVerifiedCandidateSurface(pass.final).released,false);
});

test('a mode label without an evidence reference cannot close an effect obligation', async () => {
  const runtime=new MondayRuntime({capabilities:{host:{
    name:'label-only',execute:async()=>({ok:true}),
    verify:async()=>({ok:true,mode:'effect-readback'})
  }}});
  const signal=wholeSignal();
  signal.obligations[0].requiredVerificationMode='effect-readback';
  const cycle=await runtime.cycle([signal]);
  assert.equal(cycle.intents.whole.obligations[0].status,'OPEN');
  assert.equal(cycle.results[0].ok,false);
});

test('distinct physical effects survive recovery and complete only after both readbacks', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'monday-whole-'));
  try {
    const signal={id:'files',text:'create both artifacts',domains:['code'],obligations:[
      {id:'first',domain:'code',effect:'first.txt',requiredVerificationMode:'file-readback'},
      {id:'second',domain:'code',effect:'second.txt',requiredVerificationMode:'file-readback'}
    ]};
    const executed=[];
    const receptor={name:'filesystem',execute:async action=>{
      executed.push(action.obligationId);
      const target=path.join(dir,action.effect);
      await fs.writeFile(target,action.obligationId);
      return {ok:true,target};
    },verify:async(result,action)=>{
      const bytes=await fs.readFile(result.target,'utf8');
      return {ok:bytes===action.obligationId,mode:'file-readback',evidenceRef:hash({target:result.target,bytes})};
    }};
    const first=new MondayRuntime({capabilities:{code:receptor}});
    const partial=await first.runPass([signal],{maxCycles:1});
    assert.equal(partial.state,'BLOCKED');
    assert.deepEqual(executed,['first']);
    const checkpoint=JSON.parse(JSON.stringify(first.worldline.events()));
    const restored=new Worldline();
    for(const event of checkpoint) assert.equal(restored.append(event).ok,true);
    const resumed=new MondayRuntime({worldline:restored,capabilities:{code:receptor}});
    const complete=await resumed.runPass([]);
    assert.equal(complete.state,'FULFILLED');
    assert.equal(complete.final.state.tasks['task:files'].status,'COMPLETED');
    assert.deepEqual(executed,['first','second']);
    assert.equal(await fs.readFile(path.join(dir,'first.txt'),'utf8'),'first');
    assert.equal(await fs.readFile(path.join(dir,'second.txt'),'utf8'),'second');
    assert.ok(complete.final.intents.files.obligations.every(o=>o.evidence.length===1));
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});
