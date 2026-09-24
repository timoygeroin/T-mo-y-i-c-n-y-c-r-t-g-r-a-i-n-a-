import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

import { createProcessWorkspaceExecutor } from './process-workspace-executor.mjs';
import { createProcessComputerReceptor } from './computer-receptor.mjs';
import { createNativeCdpBrowserDriver } from './native-cdp-browser-driver.mjs';
import { createBrowserComputerReceptor } from './browser-computer-receptor.mjs';
import { createReceptorMux } from './receptor-mux.mjs';

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

function routeFrom(request) {
  if (request.routeCandidate && typeof request.routeCandidate === 'object') {
    return {
      ...request.routeCandidate,
      domain:request.routeCandidate.domain || request.domain || 'general',
      effect:request.routeCandidate.effect || String(request.effect)
    };
  }

  return {
    kind:'workspace-exec',
    domain:request.domain || 'code',
    effect:String(request.effect),
    executionRequest:request.executionRequest,
    verificationRequest:request.verificationRequest,
    acceptance:request.acceptance
  };
}

const routeCandidate=routeFrom(request);
const domain=request.domain || routeCandidate.domain || (routeCandidate.kind === 'browser' ? 'host' : 'code');

const executor=createProcessWorkspaceExecutor({
  root,
  allowedCommands:['python3','node','bash','sh','git'],
  defaultTimeoutMs:30_000
});
const processReceptor=createProcessComputerReceptor({executor,name:'mondayid-process-computer'});

const browserPolicy=request.browserPolicy && typeof request.browserPolicy === 'object' ? request.browserPolicy : {};
const browserDriver=createNativeCdpBrowserDriver({
  allowedDomains:Array.isArray(browserPolicy.allowedDomains) ? browserPolicy.allowedDomains.map(String) : [],
  allowData:browserPolicy.allowData === true
});
const browserReceptor=createBrowserComputerReceptor({driver:browserDriver,name:'mondayid-native-browser'});

const receptor=createReceptorMux({
  name:'mondayid-computer-fabric',
  receptors:[processReceptor,browserReceptor]
});

const action={
  id:'computer:' + request.id,
  objectiveId:'computer:' + request.id,
  sourceSignal:'computer-request:' + request.id,
  domain,
  effect:String(request.effect),
  routeCandidate
};

const stable=value => Array.isArray(value)
  ? '[' + value.map(stable).join(',') + ']'
  : value && typeof value === 'object'
    ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}'
    : JSON.stringify(value);
const digest=value=>crypto.createHash('sha256').update(stable(value)).digest('hex');

const supported=receptor.supports(action);
let result={ok:false,code:'COMPUTER_REQUEST_UNSUPPORTED'};
let verification={ok:false,code:'COMPUTER_REQUEST_UNSUPPORTED'};
try {
  if (supported) {
    result=await receptor.execute(action);
    verification=await receptor.verify(result,action);
  }
} finally {
  await browserDriver.close();
}

const receipt={
  schema:'mondayid.computer-receipt.v1',
  id:request.id,
  requestPath,
  requestFingerprint:digest(request),
  effect:String(request.effect),
  routeKind:routeCandidate.kind || null,
  status:verification?.ok === true ? 'VERIFIED' : 'UNRESOLVED',
  supported,
  execution:{
    ok:result?.ok === true,
    code:result?.code || result?.result?.code || null,
    receptor:result?.receptor || null,
    result:result?.result || null
  },
  verification,
  runner:{
    kind:'github-actions-bootstrap',
    ownedContract:'mondayid-computer-fabric',
    externalSubstrate:'github-actions',
    commit:process.env.GITHUB_SHA || null,
    runId:process.env.GITHUB_RUN_ID || null
  },
  at:new Date().toISOString()
};

const receiptDir=path.join(root,'computer','receipts');
await fs.mkdir(receiptDir,{recursive:true});
const receiptPath=path.join(receiptDir,request.id + '.json');
await fs.writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n','utf8');
console.log(JSON.stringify({receiptPath:path.relative(root,receiptPath),status:receipt.status,routeKind:receipt.routeKind,receptor:receipt.execution.receptor,code:verification?.code || null}));
if (receipt.status !== 'VERIFIED') process.exitCode=2;
