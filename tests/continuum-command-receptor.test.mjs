import test from 'node:test';
import assert from 'node:assert/strict';
import {executeContinuumCommand} from '../src/continuum-command-receptor.mjs';

const base=()=>({schema:'monday.continuum.local.v1',version:1,threads:[],notes:[],spaces:[],events:[],tasks:[{id:'prior_task_1',title:'Already here',done:false,checkpoints:[],createdAt:'2026-11-08T10:00:00Z',updatedAt:'2026-11-08T10:00:00Z'}]});
function store({writeFails=false,noOp=false}={}){
  let content=JSON.stringify(base());
  return {load:async()=>JSON.parse(content),save:async next=>{if(writeFails)return false;if(!noOp)content=JSON.stringify(next);return true;},snapshot:()=>JSON.parse(content)};
}
const args=s=>({text:'добавь задачу: Подготовить показ Эли',load:s.load,save:s.save,nextId:()=> 'local_receipt_123456',at:1794154200000});

test('natural-language task creates a real task with app-compatible shape and local readback',async()=>{
  const s=store();const out=await executeContinuumCommand(args(s));
  assert.equal(out.ok,true);
  assert.equal(out.code,'LOCAL_VERIFIED_READBACK');
  const state=s.snapshot();
  assert.equal(state.tasks.length,2);
  assert.equal(state.tasks[0].title,'Подготовить показ Эли');
  assert.deepEqual(state.tasks[0].checkpoints,[]);
  assert.equal(typeof state.tasks[0].updatedAt,'string');
  assert.equal(state.tasks[1].title,'Already here');
  assert.equal(state.receipts[0].verified,false);
  assert.equal(out.independentExternalEffect,false);
});

test('storage failure and a lying no-op write cannot claim completion',async()=>{
  for(const opts of [{writeFails:true},{noOp:true}]){
    const s=store(opts);const out=await executeContinuumCommand(args(s));
    assert.equal(out.ok,false);
    assert.equal(s.snapshot().tasks.length,1);
  }
});

test('duplicate command cannot falsely report a new effect',async()=>{
  const s=store();const first=await executeContinuumCommand(args(s));
  const second=await executeContinuumCommand({...args(s),nextId:()=> 'local_receipt_123457'});
  assert.equal(first.ok,true);assert.equal(second.ok,false);
  assert.equal(s.snapshot().tasks.length,2);
});

test('secret-bearing request is denied before any persistent write',async()=>{
  const s=store();const out=await executeContinuumCommand({...args(s),text:'добавь задачу: password=abc123secret'});
  assert.equal(out.ok,false);assert.equal(s.snapshot().tasks.length,1);
});
