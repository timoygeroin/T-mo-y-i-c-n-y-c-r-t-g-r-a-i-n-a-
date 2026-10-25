import test from 'node:test';
import assert from 'node:assert/strict';
import mcpHandler from '../api/mcp.mjs';
import httpHandler from '../api/deus0.mjs';

function response(){
 return {statusCode:null,headers:{},body:null,
 setHeader(k,v){this.headers[k]=v;return this;},
 status(code){this.statusCode=code;return this;},
 json(x){this.body=x;return this;},
 end(){return this;}};
}
const model=()=>({
 id:'host-portability-synthetic',
 initial:{evidence:0,continuity:0,credits:0},
 goals:{evidence:{min:1},continuity:{min:1}},
 constraints:{credits:{max:2}},horizon:2,
 actions:[
  {id:'observe',delta:{evidence:1,credits:1}},
  {id:'transfer',delta:{continuity:1,credits:1},requires:{evidence:{min:1}}},
  {id:'false_claim',delta:{continuity:5,credits:5}}
 ]
});
async function invoke(args,token=null){
 const req={method:'POST',headers:token?{authorization:'Bearer '+token}:{},body:{
  jsonrpc:'2.0',id:23,method:'tools/call',params:{name:'simulate_counterfactual',arguments:args}
 }};
 const res=response();await mcpHandler(req,res);return res;
}
test('untrusted MCP hosts are denied before any simulation',async()=>{
 const res=await invoke({model:model()});
 assert.equal(res.statusCode,200);
 assert.equal(res.body.error.code,-32001);
 assert.equal(res.body.error.message,'PRIVATE_TOOL_AUTH_REQUIRED');
});
test('authenticated host gets same bounded DEUS-0 result as first-party HTTP',async()=>{
 const old=process.env.MONDAYID_HOST_TOKEN;
 const previousFetch=globalThis.fetch;
 let remoteCalls=0;
 process.env.MONDAYID_HOST_TOKEN='deus0-test-private-token';
 globalThis.fetch=async()=>{remoteCalls++;throw Error('no external call allowed')};
 try{
  const m=model(),fromMcp=await invoke({model:m},'deus0-test-private-token');
  const fromHttp=response();await httpHandler({method:'POST',headers:{'content-type':'application/json'},body:{model:m}},fromHttp);
  assert.equal(fromMcp.statusCode,200);
  assert.equal(fromMcp.body.result.structuredContent.ok,true);
  const a=fromMcp.body.result.structuredContent.report;
  const b=fromHttp.body.report;
  assert.deepEqual(a,b);
  assert.equal(a.epistemic,'hypothetical');
  assert.deepEqual(a.proposal.steps,['observe','transfer']);
  assert.equal(a.externalActionsExecuted,0);
  assert.equal(a.independentRealityReadback,false);
  assert.equal(remoteCalls,0);
 }finally{
  if(old===undefined)delete process.env.MONDAYID_HOST_TOKEN;
  else process.env.MONDAYID_HOST_TOKEN=old;
  globalThis.fetch=previousFetch;
 }
});
test('authenticated MCP tool fails closed on invalid action and excessive compute',async()=>{
 const old=process.env.MONDAYID_HOST_TOKEN;process.env.MONDAYID_HOST_TOKEN='deus0-test-private-token';
 try{
  const m=model();m.actions[0].command='delete everything';
  const a=await invoke({model:m},'deus0-test-private-token');
  assert.equal(a.body.result.isError,true);
  assert.equal(a.body.result.structuredContent.code,'DEUS0_EXTERNAL_EXECUTION_FORBIDDEN');
  const n=model();n.maxNodes=500;
  const b=await invoke({model:n},'deus0-test-private-token');
  assert.equal(b.body.result.structuredContent.code,'NODE_BUDGET_EXCEEDED');
  const c=await invoke({model:model(),ignoreAuthority:true},'deus0-test-private-token');
  assert.equal(c.body.result.structuredContent.code,'MODEL_WRAPPER_REQUIRED');
 }finally{
  if(old===undefined)delete process.env.MONDAYID_HOST_TOKEN;
  else process.env.MONDAYID_HOST_TOKEN=old;
 }
});
