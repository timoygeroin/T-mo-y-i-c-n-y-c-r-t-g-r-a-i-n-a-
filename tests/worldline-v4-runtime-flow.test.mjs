import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';

const writer='writer-real-runtime-test-secret';
const reader='reader-real-runtime-test-secret';
const signal='worldline-runtime-e2e-nov13';
const root=new URL('../',import.meta.url).pathname;
function run(source,env){
  return new Promise((resolve,reject)=>{
    const p=spawn(process.execPath,[path.join(root,source)],{env:{...process.env,...env},stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';const timeout=setTimeout(()=>{p.kill('SIGKILL');reject(Error('Timed out '+source));},15_000);
    p.stdout.on('data',b=>stdout+=b);
    p.stderr.on('data',b=>stderr+=b);
    p.on('error',reject);
    p.on('close',code=>{clearTimeout(timeout);resolve({code,stdout,stderr});});
  });
}
function start(file){
  const p=spawn(process.execPath,[path.join(root,'src/worldline-v4-cli.mjs')],{
    env:{...process.env,MONDAYID_WORLDLINE_FILE:file,MONDAYID_WORLDLINE_WRITER_TOKEN:writer,
      MONDAYID_WORLDLINE_READ_TOKEN:reader,MONDAYID_WORLDLINE_PORT:'0'},stdio:['ignore','pipe','pipe']});
  const ready=new Promise((resolve,reject)=>{
    let output='';const timeout=setTimeout(()=>reject(Error('Server not ready')),8000);
    p.stdout.on('data',b=>{output+=b;const match=/WORLDLINE_READY ({[^\n]+})/.exec(output);
      if(match){clearTimeout(timeout);resolve(JSON.parse(match[1]).url);}});
    p.on('error',reject);
    p.on('close',code=>{clearTimeout(timeout);reject(Error('Server exited '+code));});
  });
  return {p,ready,close:()=>new Promise(resolve=>{if(p.exitCode!==null)return resolve();p.once('close',resolve);p.kill('SIGTERM');})};
}

test('whole MondayRuntime uses HTTP writer, independent host reader, and separate read-only receiver',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'mondayid-full-runtime-'));
  const file=path.join(dir,'persistent.jsonl');
  let host=start(file);
  try{
    const url=await host.ready;
    const producer=await run('src/transfer-proof.mjs',{
      MONDAYID_WORLDLINE_URL:url,MONDAYID_WORLDLINE_WRITER_TOKEN:writer,
      MONDAYID_WORLDLINE_READ_TOKEN:reader,MONDAYID_PROOF_SIGNAL_ID:signal
    });
    assert.equal(producer.code,0,producer.stderr+'\n'+producer.stdout);
    const outcome=JSON.parse(producer.stdout);
    assert.equal(outcome.ok,true);
    assert.equal(outcome.code,'CLEAN_HOST_TRANSFER_PASS');
    assert.equal(outcome.proof?.firstHost?.verification?.independentProof?.source,'HOST_READER');
    assert.equal(outcome.proof?.nextHost?.inheritedEffect,true);
    await host.close();
    host=start(file);
    const restartedUrl=await host.ready;
    const received=await run('src/worldline-receive.mjs',{
      MONDAYID_WORLDLINE_URL:restartedUrl,MONDAYID_WORLDLINE_READ_TOKEN:reader,
      MONDAYID_WORLDLINE_WRITER_TOKEN:'',MONDAYID_PROOF_SIGNAL_ID:signal
    });
    assert.equal(received.code,0,received.stderr+'\n'+received.stdout);
    const replica=JSON.parse(received.stdout);
    assert.equal(replica.state,'RECOVERED_AND_MATCHED');
    assert.ok(replica.actionId?.startsWith('action:'));
    const forged=await run('src/worldline-receive.mjs',{
      MONDAYID_WORLDLINE_URL:restartedUrl,MONDAYID_WORLDLINE_READ_TOKEN:reader,
      MONDAYID_WORLDLINE_WRITER_TOKEN:'',MONDAYID_PROOF_SIGNAL_ID:signal+'-fake'
    });
    assert.notEqual(forged.code,0);
    assert.equal(JSON.parse(forged.stdout).state,'NOT_RECOVERED');
    assert.equal(producer.stdout.includes(writer),false);
    assert.equal(received.stdout.includes(reader),false);
  }finally{await host.close();await rm(dir,{recursive:true,force:true});}
});