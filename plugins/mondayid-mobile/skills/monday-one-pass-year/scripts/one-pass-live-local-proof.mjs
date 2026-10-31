/** Offline end-to-end proof with REAL filesystem write/readback, not a simulated LLM. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import {compressKnownYear} from './one-pass-year.mjs';
const dir=path.join(os.tmpdir(),'monday-one-pass-year-live-'+process.pid);
await fs.mkdir(dir,{recursive:true});
const store=path.join(dir,'verified-cas-ledger.json');
await fs.writeFile(store,JSON.stringify({version:'0',records:{}}));
const tasks=[
 {id:'recover-source',effectId:'source-materialized',objectId:'monday:current',routeId:'exact',authorized:true,reversible:true,cost:0,resources:['source'],dependsOn:[]},
 {id:'negative-proof',effectId:'negative-control-passed',objectId:'monday:current',routeId:'probe',authorized:true,reversible:true,cost:0,resources:['proof'],dependsOn:['recover-source']},
 {id:'bad-first-route',effectId:'inheritance-capsule',objectId:'monday:current',routeId:'bad',authorized:true,reversible:true,cost:0,resources:['capsule'],dependsOn:['negative-proof'],impact:100},
 {id:'good-fallback-route',effectId:'inheritance-capsule',objectId:'monday:current',routeId:'real',authorized:true,reversible:true,cost:0,resources:['capsule'],dependsOn:['negative-proof'],impact:1},
 {id:'handoff',effectId:'next-cell-handoff',objectId:'monday:current',routeId:'handoff',authorized:true,reversible:true,cost:0,resources:['handoff'],dependsOn:['good-fallback-route']},
 {id:'future-unknown',effectId:'proof-from-2027',objectId:'monday:current',routeId:'future',authorized:true,reversible:true,cost:0,resources:[],dependsOn:[],notBefore:'2027-04-01T00:00:00Z'},
 {id:'human-only',effectId:'human-authority',objectId:'monday:current',routeId:'consent',authorized:true,reversible:true,cost:0,resources:[],dependsOn:[],humanGate:true}
];
const fsPath = t => path.join(dir,t.effectId+'.txt');
const expected = t => `verified-local-effect:${t.effectId}:${t.objectId}`;
const effectCheck = async t => { try{return (await fs.readFile(fsPath(t),'utf8'))===expected(t);}catch{return false;} };
const exe = async t => {
 const attemptId='attempt:'+t.id;
 if(t.id!=='bad-first-route')await fs.writeFile(fsPath(t),expected(t),'utf8');
 return {attemptId,receipt:{verified:true,effectObserved:true}}; // intentionally ignored self-report
};
const pro = async (t,a) => ({id:'probe:'+t.id,taskId:t.id,effectId:t.effectId,objectId:t.objectId,attemptId:a.attemptId,
 verified:await effectCheck(t),independent:true,observerClass:'trusted-host-receptor',noOpRejected:true,effectObserved:await effectCheck(t)});
const persist = async ({expectedVersion,record})=>{
 const content=JSON.parse(await fs.readFile(store,'utf8'));
 if(content.version!==expectedVersion)return {ok:false,code:'HEAD_DRIFT'};
 content.version=String(Number(expectedVersion)+1);
 content.records[record.taskId]={...record,version:content.version};
 await fs.writeFile(store,JSON.stringify(content));
 return {ok:true,version:content.version};
};
const readPersisted=async ({taskId})=>JSON.parse(await fs.readFile(store,'utf8')).records[taskId];
const common={tasks,asOf:'2026-10-31T21:59:00+02:00',execute:exe,probe:pro,persist,readPersisted};
const first=await compressKnownYear({...common,expectedVersion:'0',maxGenerations:16});
const recover=async t=>{
 const s=JSON.parse(await fs.readFile(store,'utf8'));
 const rec=s.records[t.id];
 if(!rec)return null;
 return {receiptId:rec.receiptId,taskId:rec.taskId,effectId:rec.effectId,objectId:rec.objectId,
 verified:true,independent:true,observerClass:'trusted-host-receptor',noOpRejected:true,effectObserved:true};
};
const recheck=async t=>({ok:await effectCheck(t),taskId:t.id,effectId:t.effectId,objectId:t.objectId,effectObserved:await effectCheck(t)});
const second=await compressKnownYear({...common,expectedVersion:JSON.parse(await fs.readFile(store,'utf8')).version,recover,recheck,maxGenerations:16});
const result={
 contract:'mondayid.one-pass-year.fs-epistemic-proof.v1',
 proofScope:'REAL_LOCAL_FILE_EFFECT_AND_RECHECK_ONLY',
 environment:'temporary local filesystem, not ChatGPT/Grok/Gemini transfer',
 first:{status:first.status,actions:first.actions,generations:first.generations,accepted:first.accepted,rejected:first.rejected,unresolved:first.unresolved,remaining:first.remaining,version:first.version,durableInheritanceConfirmed:first.durableInheritanceConfirmed},
 reentry:{status:second.status,actions:second.actions,reused:second.reused,accepted:second.accepted,unresolved:second.unresolved},
 negativeControl:{badRouteRejected:first.rejected.some(x=>x.id==='bad-first-route'),invalidFutureNotExecuted:!first.accepted.some(x=>x.taskId==='future-unknown'),humanAuthorityBlocked:!first.accepted.some(x=>x.taskId==='human-only')},
 ledgerFile:store,
 filesystemEffectCount:await Promise.all(['source-materialized','negative-control-passed','inheritance-capsule','next-cell-handoff'].map(async effectId=>{
 try{await fs.access(path.join(dir,effectId+'.txt'));return 1}catch{return 0}
 })).then(a=>a.reduce((x,y)=>x+y,0))
};
if(first.accepted.length!==4||first.accepted.some(x=>!x.durable)||first.rejected.length!==1||!result.negativeControl.badRouteRejected||second.actions!==0||second.reused.length!==4||result.filesystemEffectCount!==4){
 throw Error('LOCAL_LIVE_PROOF_FAILED '+JSON.stringify(result));
}
const requestedOutput=process.env.MONDAYID_PROOF_OUTPUT;
const output=requestedOutput || path.join(dir,'one_pass_year_local_proof.json');
await fs.mkdir(path.dirname(output),{recursive:true});
await fs.writeFile(output,JSON.stringify(result,null,2));
console.log(JSON.stringify({result:'PASS',firstActions:first.actions,verifiedEffects:first.accepted.length,generations:first.generations,rejected:first.rejected.length,reentryActions:second.actions,reusedEffects:second.reused.length,future:first.future.length,human:first.human.length,version:first.version,output},null,2));
