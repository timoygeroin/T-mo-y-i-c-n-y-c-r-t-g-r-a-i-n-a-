import test from 'node:test';
import assert from 'node:assert/strict';
import mcpHandler from '../api/mcp.mjs';
import { buildCarrierAttachSnapshot } from '../src/chatgpt-carrier-synapse.mjs';
import fs from 'node:fs';

function response(){
 return {statusCode:null,body:null,headers:{},
  setHeader(k,v){this.headers[k]=v;},status(code){this.statusCode=code;return this;},
  json(value){this.body=value;return this;},end(){return this;}};
}
function request(method,name,args={},authorization=null){
 return {method:'POST',headers:authorization?{authorization:'Bearer '+authorization}:{},
  body:{jsonrpc:'2.0',id:71,method:'tools/call',params:{name,arguments:args}}};
}

test('amplify_intent is discoverable to hosts but private at the execution boundary',async()=>{
 const list=response();
 await mcpHandler({method:'POST',body:{jsonrpc:'2.0',id:7,method:'tools/list'}},list);
 assert.ok(list.body.result.tools.some(t=>t.name==='amplify_intent'));
 const denied=response();
 await mcpHandler(request('POST','amplify_intent',{signal:{text:'Пересобери всю систему'}}),denied);
 assert.equal(denied.body.error.code,-32001);
});

test('authenticated cross-host preflight returns multi-domain proof requirements without executing or claiming success',async()=>{
 const prev=process.env.MONDAYID_HOST_TOKEN;
 process.env.MONDAYID_HOST_TOKEN='owner-proof-auth';
 try{
  const result=response();
  await mcpHandler(request('POST','amplify_intent',{signal:{id:'cross-host',text:'Пересобери всю систему'}},'owner-proof-auth'),result);
  assert.equal(result.statusCode,200);
  const value=result.body.result.structuredContent;
  assert.equal(value.ok,true);
  assert.equal(value.status,'PREFLIGHT_ONLY');
  assert.equal(value.scope,'WHOLE_ORGANISM');
  assert.deepEqual(value.domains,['continuity','host','code','vision','research','integration']);
  assert.equal(value.requireDomainReceptor,true);
  assert.equal(value.effectVerified,false);
  assert.equal(value.persisted,false);
  assert.ok(value.obligations.some(x=>x.domain==='integration'&&x.requiredVerificationMode==='external-exact-readback'));
 }finally{
  if(prev===undefined)delete process.env.MONDAYID_HOST_TOKEN;else process.env.MONDAYID_HOST_TOKEN=prev;
 }
});

test('carrier advertises the exact preflight mechanism without pretending host interception',()=>{
 const system=JSON.parse(fs.readFileSync(new URL('../SYSTEM.json',import.meta.url),'utf8'));
 const out=buildCarrierAttachSnapshot({system,identity:{product:'MondayID',generation:system.generation}});
 assert.equal(out.contracts.taskAmplifier?.tool,'amplify_intent');
 assert.equal(out.contracts.taskAmplifier?.autoInterceptsNativeChat,false);
});

test('quoted or negated hypothetical command is not promoted to whole-system authorization',async()=>{
 const {normalizeIntent}=await import('../src/intent-field.mjs');
 for(const text of ['Я не прошу пересобери всю систему','Не надо перенастраивать всю систему']){
  assert.notEqual(normalizeIntent({text}).amplification?.scope,'WHOLE_ORGANISM',text);
 }
});
