import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

import { createProcessWorkspaceExecutor } from './process-workspace-executor.mjs';
import { createProcessComputerReceptor } from './computer-receptor.mjs';

const requestPath=process.argv[2];
if (!requestPath) throw new Error('COMPUTER_REQUEST_PATH_REQUIRED');

const root=path.resolve(process.cwd());
const absoluteRequest=path.resolve(root,requestPath);
if (!(absoluteRequest === root || absoluteRequest.startsWith(root + path.sep))) {
  throw new Error('COMPUTER_REQUEST_ESCAPE_BLOCKED');
}

const request=JSON.parse(await fs.readFile(absoluteRequest,'utf8'));
if (request?.schema !== 'mondayid.computer-task.v1') throw new Error('COMPUTER_REQUEST_SCHEMA_INVALID');
if (!/^[A-Za-z0-9._-]{1,120}$/.test(String(request.id || ''))) throw new Error('COMPUTER_REQUEST_ID_INVALID');
if (!String(request.effect || '').trim()) throw new Error('COMPUTER_REQUEST_EFFECT_REQUIRED');

const executor=createProcessWorkspaceExecutor({
  root,
  allowedCommands:['python3','node','bash','sh','git'],
  defaultTimeoutMs:30_000
});
const receptor=createProcessComputerReceptor({executor,name:'mondayid-github-actions-computer'});

const action={
  id:`computer:${request.id}`,
  objectiveId:`computer:${request.id}`,
  sourceSignal:`computer-request:${request.id}`,
  domain:request.domain || 'code',
  effect:String(request.effect),
  routeCandidate:{
    kind:'workspace-exec',
    domain:request.domain || 'code',
    effect:String(request.effect),
    executionRequest:request.executionRequest,
    verificationRequest:request.verificationRequest,
    acceptance:request.acceptance
  }
};

const supported=receptor.supports(action);
let result={ok:false,code:'COMPUTER_REQUEST_UNSUPPORTED'};
let verification={ok:false,code:'COMPUTER_REQUEST_UNSUPPORTED'};
if (supported) {
  result=await receptor.execute(action);
  verification=await receptor.verify(result,action);
}

const stable=value => Array.isArray(value)
  ? `[${value.map(stable).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const digest=value=>crypto.createHash('sha256').update(stable(value)).digest('hex');
const receipt={
  schema:'mondayid.computer-receipt.v1',
  id:request.id,
  requestPath,
  requestFingerprint:digest(request),
  effect:String(request.effect),
  status:verification?.ok === true ? 'VERIFIED' : 'UNRESOLVED',
  supported,
  execution:{
    ok:result?.ok === true,
    code:result?.code || null,
    evidence:result?.evidence || null
  },
  verification,
  runner:{
    kind:'github-actions-bootstrap',
    ownedContract:'mondayid-process-computer',
    externalSubstrate:'github-actions',
    commit:process.env.GITHUB_SHA || null,
    runId:process.env.GITHUB_RUN_ID || null
  },
  at:new Date().toISOString()
};

const receiptDir=path.join(root,'computer','receipts');
await fs.mkdir(receiptDir,{recursive:true});
const receiptPath=path.join(receiptDir,`${request.id}.json`);
await fs.writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n','utf8');
console.log(JSON.stringify({receiptPath:path.relative(root,receiptPath),status:receipt.status,code:verification?.code || null}));
if (receipt.status !== 'VERIFIED') process.exitCode=2;
