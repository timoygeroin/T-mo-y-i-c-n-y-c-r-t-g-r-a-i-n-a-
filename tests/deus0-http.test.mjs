import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/deus0.mjs';

const headers = {'content-type':'application/json'};
function response() {
  return {statusCode:null,headers:{},body:null,
    setHeader(k,v){this.headers[k]=v;return this},
    status(n){this.statusCode=n;return this},
    json(obj){this.body=obj;return this}};
}
async function call(method, body=null, customHeaders=headers) {
  const res=response();
  await handler({method,headers:customHeaders,body},res);
  return res;
}
const example=()=>({
  id:'last-observer-synthetic',
  initial:{continuity:0,evidence:0,budget:0},
  goals:{continuity:{min:2},evidence:{min:2}},
  constraints:{budget:{max:3}},
  actions:[
    {id:'inspect',delta:{evidence:1,budget:1}},
    {id:'test',delta:{evidence:1,continuity:1,budget:1},requires:{evidence:{min:1}}},
    {id:'verify',delta:{continuity:1,budget:1},requires:{evidence:{min:2}}},
    {id:'shortcut',delta:{continuity:5,budget:6}}
  ],
  horizon:3
});

test('discovery GET truthfully labels simulation and limitations',async()=>{
  const r=await call('GET');
  assert.equal(r.statusCode,200);
  assert.equal(r.body.organ,'DEUS-0');
  assert.equal(r.body.externalReadback,false);
  assert.equal(r.body.persistence,false);
  assert.equal(r.headers['Cache-Control'],'no-store');
});
test('POST returns a deterministic hypothetical receipt and bounded route',async()=>{
  const model=example();
  const a=await call('POST',{model}),b=await call('POST',{model});
  assert.equal(a.statusCode,200);
  assert.deepEqual(a.body,b.body);
  assert.equal(a.body.report.state,'SIMULATED_GOAL_REACHED');
  assert.equal(a.body.report.epistemic,'hypothetical');
  assert.equal(a.body.report.externalActionsExecuted,0);
  assert.equal(a.body.report.independentRealityReadback,false);
  assert.deepEqual(a.body.report.proposal.steps,['inspect','test','verify']);
  assert.ok(a.body.report.search.rejected.invariant>=1);
  assert.match(a.body.report.receipt,/^sha256:[a-f0-9]{64}$/);
});
test('POST without proof cannot declare real-world success',async()=>{
  const r=await call('POST',{model:example()});
  assert.equal(r.body.report.nextGate,'EXTERNAL_OBSERVATION_REQUIRED_FOR_REAL_WORLD_CLAIMS');
  assert.equal(r.body.report.modelLimits.assumptionsNotValidatedInReality,true);
});
test('rejects invalid method and content type',async()=>{
  assert.equal((await call('DELETE')).statusCode,405);
  assert.equal((await call('POST',{model:example()},{'content-type':'text/plain'})).statusCode,415);
});
test('rejects too-large request before simulation',async()=>{
  const r=await call('POST',{model:example()},{...headers,'content-length':'12001'});
  assert.equal(r.statusCode,413);
  assert.equal(r.body.code,'REQUEST_TOO_LARGE');
});
test('rejects oversized budget even if engine would otherwise allow it',async()=>{
  const m=example();m.maxNodes=257;
  assert.equal((await call('POST',{model:m})).body.code,'NODE_BUDGET_EXCEEDED');
  m.maxNodes=1;m.horizon=7;
  assert.equal((await call('POST',{model:m})).body.code,'HORIZON_BUDGET_EXCEEDED');
});
test('rejects network or process execution attempts in actions',async()=>{
  const m=example();m.actions[0].url='https://example.org';
  const r=await call('POST',{model:m});
  assert.equal(r.statusCode,400);
  assert.equal(r.body.code,'DEUS0_EXTERNAL_EXECUTION_FORBIDDEN');
});
test('rejects external wrapper instructions and malformed JSON',async()=>{
  const m=example();const r=await call('POST',{model:m,command:'do this'});
  assert.equal(r.body.code,'MODEL_WRAPPER_REQUIRED');
  assert.equal((await call('POST','{bad')).statusCode,400);
});
test('rejects action and dimension amplification',async()=>{
  const m=example();m.actions=Array.from({length:13},(_,i)=>({id:'x'+i,delta:{continuity:1}}));
  assert.equal((await call('POST',{model:m})).body.code,'ACTION_BUDGET_EXCEEDED');
  const n=example();n.initial=Object.fromEntries(Array.from({length:9},(_,i)=>['x'+i,0]));
  assert.equal((await call('POST',{model:n})).body.code,'DIMENSION_BUDGET_EXCEEDED');
});
