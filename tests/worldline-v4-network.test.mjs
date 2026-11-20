import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {TrustedWorldlineReceptor} from '../src/trusted-worldline-receptor.mjs';
import {createWorldlineIndependentReadback} from '../src/trusted-host-reader.mjs';

const writer='writer-ephemeral-test-secret',reader='reader-ephemeral-test-secret';
async function server(file){
  const proc=spawn(process.execPath,[new URL('../src/worldline-v4-cli.mjs',import.meta.url).pathname],{
    env:{...process.env,MONDAYID_WORLDLINE_FILE:file,MONDAYID_WORLDLINE_WRITER_TOKEN:writer,
      MONDAYID_WORLDLINE_READ_TOKEN:reader,MONDAYID_WORLDLINE_PORT:'0'},stdio:['ignore','pipe','pipe']});
  const url=await new Promise((resolve,reject)=>{
    let out='';const timeout=setTimeout(()=>reject(Error('worldline startup timeout')),7000);
    proc.stdout.on('data',chunk=>{out+=chunk;const m=/WORLDLINE_READY ({[^\n]+})/.exec(out);if(m){clearTimeout(timeout);resolve(JSON.parse(m[1]).url);}});
    proc.on('exit',code=>{clearTimeout(timeout);reject(Error('Worldline terminated '+code));});
    proc.on('error',reject);
  });
  return {proc,url,stop:()=>new Promise(resolve=>{proc.once('exit',resolve);proc.kill('SIGTERM');})};
}
function request(url,token,options={}){return fetch(url,{...options,headers:{...options.headers,authorization:`Bearer ${token}`}});}
const action={id:'action:real-http-handoff:continuity',objectiveId:'real-http-handoff',sourceSignal:'handoff-buyer-task',domain:'continuity',effect:'durable independent worldline transfer'};

test('real HTTP write -> independent reader -> restart -> new host; reject tampering, wrong credentials and conflict',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'mondayid-http-'));
  const file=path.join(dir,'worldline.jsonl');
  let app=await server(file);
  try{
    const host='mondayid:real-handoff';const identityFingerprint='mondayid:test:v4';const sourceRef='test-real-http';
    const base={baseUrl:app.url,host,identityFingerprint,sourceRef};
    const executor=new TrustedWorldlineReceptor({...base,token:writer,readerToken:reader});
    const witness=createWorldlineIndependentReadback({...base,readerToken:reader});
    const result=await executor.execute(action);
    assert.equal(result.ok,true);
    assert.equal(result.status,'INSERTED');
    const claimed=await executor.verify(result);
    assert.equal(claimed.ok,true);
    const seen=await witness({action,result,claimedVerification:claimed});
    assert.equal(seen.ok,true);
    assert.equal(seen.effectId,action.id);
    assert.equal((await witness({action:{...action,sourceSignal:'counterfeit'},result})).ok,false);
    assert.equal((await request(app.url+'/worldline/v4/event?eventId='+result.event.eventId,'wrong')).status,401);
    const dup=await executor.execute(action);
    assert.equal(dup.status,'DUPLICATE');
    const altered={...result.event,valueJson:JSON.stringify({bad:'replacement'})};
    const conflict=await request(app.url+'/worldline/v4/append',writer,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(altered)});
    assert.equal(conflict.status,409);
    await app.stop();
    app=await server(file);
    const newHost=await request(app.url+'/worldline/v4/snapshot?limit=50',reader);
    assert.equal(newHost.status,200);
    const recovered=await newHost.json();
    assert.equal(recovered.trust,'AUTHENTICATED_MACHINE_WRITER');
    const inherited=recovered.events.find(e=>e.eventId===result.event.eventId);
    assert.equal(JSON.parse(inherited.valueJson).actionId,action.id);
    const independently=await createWorldlineIndependentReadback({...base,baseUrl:app.url,readerToken:reader})({action,result});
    assert.equal(independently.ok,true);
    assert.equal(JSON.stringify(recovered).includes(writer),false);
    assert.equal(JSON.stringify(recovered).includes(reader),false);
  }finally{if(app.proc.exitCode===null)await app.stop();await rm(dir,{recursive:true,force:true});}
});