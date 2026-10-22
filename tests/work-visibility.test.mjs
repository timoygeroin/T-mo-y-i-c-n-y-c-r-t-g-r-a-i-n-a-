import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {projectWorkVisibility} from '../src/execution/work-visibility.mjs';
import {createFileWorkJournal} from '../src/execution/file-work-journal.mjs';

const job={jobId:'workless:test-1',status:'running',originalTask:{instruction:'secret'},events:[
 {index:555,phase:'start',secret:'password'},
 {index:11,phase:'compute_route',providerId:'local'},
 {index:22,phase:'route_result',blockerCode:'quota'},
 {index:23,phase:'effect_readback',verification:{ok:true,evidenceRef:'file:v1'}}]};

test('work activity cursor uses canonical event position, not injected event.index',()=>{
 const first=projectWorkVisibility(job,{after:-1,limit:2});
 assert.deepEqual(first.events.map(x=>x.index),[0,1]);
 assert.equal(first.nextCursor,1);
 assert.equal(first.hasMore,true);
 const next=projectWorkVisibility(job,{after:first.nextCursor,limit:2});
 assert.deepEqual(next.events.map(x=>x.index),[2,3]);
 assert.equal(next.hasMore,false);
});

test('recorded work is not falsely called live or independently verified',()=>{
 assert.equal(projectWorkVisibility(job).state,'RECORDED_NOT_LIVE_CONFIRMED');
 assert.equal(projectWorkVisibility({...job,status:'complete',result:{status:'complete'}}).state,'REPORTED_COMPLETE_UNVERIFIED');
 assert.equal(projectWorkVisibility({...job,status:'blocked'}).state,'BLOCKED');
 assert.equal(projectWorkVisibility(job).events.at(-1).state,'READBACK_REPORTED');
});

test('UI stream never serializes task, raw event content, private provider fields or evidence',()=>{
 const result=projectWorkVisibility(job);
 const encoded=JSON.stringify(result);
 for(const privateText of ['password','secret','file:v1','local']) assert.equal(encoded.includes(privateText),false);
});

test('unknown blocker strings and missing jobs never become public event payloads',()=>{
 const suspicious={...job,events:[{phase:'route_result',blockerCode:'ghp_private_token'}]};
 const out=projectWorkVisibility(suspicious);
 assert.equal(out.events[0].code,null);
 assert.equal(projectWorkVisibility(null).state,'NOT_FOUND');
 assert.throws(()=>projectWorkVisibility(job,{after:-2}),/INVALID_CURSOR/);
 assert.throws(()=>projectWorkVisibility(job,{limit:101}),/INVALID_LIMIT/);
});

test('a fresh journal reader streams the same durable session without secret leakage',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'monday-work-activity-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const file=join(dir,'journal.json');
 const first=createFileWorkJournal(file);
 const id=await first.open({instruction:'private intent'});
 await first.append(id,{phase:'start',token:'sensitive-value'});
 await first.append(id,{phase:'route_result',blockerCode:'quota',privateToken:'secret'});
 const fresh=createFileWorkJournal(file);
 const firstPage=await fresh.activity(id,{limit:1});
 assert.equal(firstPage.nextCursor,0);
 assert.equal(firstPage.state,'RECORDED_NOT_LIVE_CONFIRMED');
 const nextPage=await fresh.activity(id,{after:firstPage.nextCursor,limit:10});
 assert.deepEqual(nextPage.events.map(x=>x.phase),['route_result']);
 assert.ok(!JSON.stringify(nextPage).includes('secret'));
 await fresh.close(id,'complete',{status:'complete',internal:'secret'});
 const closed=createFileWorkJournal(file);
 const tail=await closed.activity(id,{after:nextPage.nextCursor});
 assert.equal(tail.state,'REPORTED_COMPLETE_UNVERIFIED');
 assert.equal(tail.events[0].phase,'close');
});


test('Workless runtime exposes one real event timeline after a verified-by-provider run, without inventing independent proof',async()=>{
 const {createWorklessRuntimeV2,createComputeRouter,createMemoryWorkJournal}=await import('../src/execution/workless-runtime-v2.mjs');
 const journal=createMemoryWorkJournal();
 const runtime=createWorklessRuntimeV2({
  journal,computeRouter:createComputeRouter([{id:'local',kind:'deterministic',capabilities:['document.render']}]),
  policy:{requiredCapabilities:['document.render']},
  workFactory:{async create(){return {async runUntilBlocker(){return {status:'complete',final:{status:'verified',evidence:'provider-claimed'}}}}}}
 });
 const finished=await runtime.run({instruction:'Make the document'});
 const activity=await runtime.readActivity(finished.jobId,{limit:30});
 assert.equal(activity.state,'REPORTED_COMPLETE_UNVERIFIED');
 assert.ok(activity.events.some(e=>e.phase==='compute_route'));
 assert.ok(activity.events.some(e=>e.phase==='close'));
 assert.equal(activity.hasMore,false);
 const encoded=JSON.stringify(activity);
 assert.ok(!encoded.includes('provider-claimed'));
});
