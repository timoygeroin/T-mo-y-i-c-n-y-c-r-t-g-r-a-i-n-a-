import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const runner=fileURLToPath(new URL('../src/execution/computer-task-runner.mjs',import.meta.url));

function run(args,{cwd,env={}}={}) {
  return new Promise(resolve => {
    const child=spawn(process.execPath,[runner,...args],{cwd,env:{...process.env,...env}});
    let stdout=''; let stderr='';
    child.stdout.on('data',chunk=>{stdout+=chunk;});
    child.stderr.on('data',chunk=>{stderr+=chunk;});
    child.on('close',code=>resolve({code,stdout,stderr}));
  });
}

test('computer task runner writes VERIFIED receipt only after independent readback', async () => {
  const root=await mkdtemp(join(tmpdir(),'mondayid-task-runner-'));
  try {
    await mkdir(join(root,'computer','requests'),{recursive:true});
    const request={
      schema:'mondayid.computer-task.v1',
      id:'self-test',
      effect:'write and independently read back a bootstrap artifact',
      domain:'code',
      executionRequest:{
        command:'python3',
        args:['-c',"from pathlib import Path; Path('artifact.txt').write_text('owned-computer-ok', encoding='utf-8')"]
      },
      verificationRequest:{
        command:'python3',
        args:['-c',"from pathlib import Path; print(Path('artifact.txt').read_text(encoding='utf-8'), end='')"]
      },
      acceptance:{stdoutEquals:'owned-computer-ok',stderrEmpty:true}
    };
    const requestPath=join(root,'computer','requests','self-test.json');
    await writeFile(requestPath,JSON.stringify(request),'utf8');

    const out=await run(['computer/requests/self-test.json'],{cwd:root,env:{GITHUB_SHA:'proof-sha',GITHUB_RUN_ID:'proof-run'}});
    assert.equal(out.code,0,out.stderr);
    const receipt=JSON.parse(await readFile(join(root,'computer','receipts','self-test.json'),'utf8'));
    assert.equal(receipt.status,'VERIFIED');
    assert.equal(receipt.execution.ok,true);
    assert.equal(receipt.verification.ok,true);
    assert.equal(receipt.verification.mode,'independent-process-readback');
    assert.equal(receipt.runner.externalSubstrate,'github-actions');
  } finally {
    await rm(root,{recursive:true,force:true});
  }
});

test('computer task runner fails closed when verification cannot prove the effect', async () => {
  const root=await mkdtemp(join(tmpdir(),'mondayid-task-runner-'));
  try {
    await mkdir(join(root,'computer','requests'),{recursive:true});
    const request={
      schema:'mondayid.computer-task.v1',
      id:'negative-proof',
      effect:'prove failure is not mislabeled complete',
      domain:'code',
      executionRequest:{command:'python3',args:['-c',"print('executed')"]},
      verificationRequest:{command:'python3',args:['-c',"print('different')"]},
      acceptance:{stdoutEquals:'expected'}
    };
    await writeFile(join(root,'computer','requests','negative-proof.json'),JSON.stringify(request),'utf8');

    const out=await run(['computer/requests/negative-proof.json'],{cwd:root});
    assert.notEqual(out.code,0);
    const receipt=JSON.parse(await readFile(join(root,'computer','receipts','negative-proof.json'),'utf8'));
    assert.equal(receipt.status,'UNRESOLVED');
    assert.equal(receipt.verification.ok,false);
  } finally {
    await rm(root,{recursive:true,force:true});
  }
});


test('computer request fingerprint changes when nested execution semantics change', async () => {
  const root=await mkdtemp(join(tmpdir(),'mondayid-task-fingerprint-'));
  try {
    await mkdir(join(root,'computer','requests'),{recursive:true});
    const base={
      schema:'mondayid.computer-task.v1',
      id:'fingerprint-proof',
      effect:'prove nested task semantics are fingerprinted',
      domain:'code',
      executionRequest:{command:'python3',args:['-c',"from pathlib import Path; Path('fingerprint.txt').write_text('A', encoding='utf-8')"]},
      verificationRequest:{command:'python3',args:['-c',"from pathlib import Path; print(Path('fingerprint.txt').read_text(encoding='utf-8'), end='')"]},
      acceptance:{stdoutEquals:'A'}
    };
    const requestPath=join(root,'computer','requests','fingerprint-proof.json');
    await writeFile(requestPath,JSON.stringify(base),'utf8');
    let out=await run(['computer/requests/fingerprint-proof.json'],{cwd:root});
    assert.equal(out.code,0,out.stderr);
    let receipt=JSON.parse(await readFile(join(root,'computer','receipts','fingerprint-proof.json'),'utf8'));
    const first=receipt.requestFingerprint;

    const changed={...base,executionRequest:{...base.executionRequest,args:['-c',"from pathlib import Path; Path('fingerprint.txt').write_text('A', encoding='utf-8') # nested-change"]}};
    await writeFile(requestPath,JSON.stringify(changed),'utf8');
    out=await run(['computer/requests/fingerprint-proof.json'],{cwd:root});
    assert.equal(out.code,0,out.stderr);
    receipt=JSON.parse(await readFile(join(root,'computer','receipts','fingerprint-proof.json'),'utf8'));
    assert.notEqual(receipt.requestFingerprint,first);
  } finally {
    await rm(root,{recursive:true,force:true});
  }
});
