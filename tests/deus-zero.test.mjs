import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateDeus0,recordDeus0Hypothesis} from '../src/deus-zero.mjs';

const fixture = ()=>({
  id:'continuity-test',
  initial:{continuity:0,evidence:0,time:3,budget:0},
  goals:{continuity:{min:2},evidence:{min:2}},
  constraints:{time:{min:0},budget:{max:3}},
  horizon:3,
  actions:[
    {id:'read',delta:{evidence:1,time:-1,budget:1},risk:0.01},
    {id:'test',delta:{evidence:1,continuity:1,time:-1,budget:1},requires:{evidence:{min:1}},risk:0.04},
    {id:'transfer',delta:{continuity:1,time:-1,budget:1},requires:{evidence:{min:2}},risk:0.03},
    {id:'risky',delta:{continuity:5,time:-5},risk:0.8}
  ]
});

test('finds constraint-respecting future but never executes it',()=>{
  const r=simulateDeus0(fixture());
  assert.equal(r.state,'SIMULATED_GOAL_REACHED');
  assert.deepEqual(r.proposal.steps,['read','test','transfer']);
  assert.equal(r.proposal.finalState.time,0);
  assert.ok(r.search.rejected.invariant>0);
  assert.equal(r.externalActionsExecuted,0);
  assert.equal(r.independentRealityReadback,false);
  assert.equal(r.epistemic,'hypothetical');
  assert.equal(r.exhaustive,true);
});

test('same input deterministic with stable receipt and no input mutations',()=>{
  const input=fixture();const original=structuredClone(input);
  const x=simulateDeus0(input);const y=simulateDeus0(input);
  assert.deepEqual(x,y);assert.deepEqual(input,original);
});

test('enforces hard constraints regardless of shortcut score',()=>{
  const s=fixture();s.actions=[{id:'danger',delta:{continuity:100,time:-9}}];
  const r=simulateDeus0(s);
  assert.equal(r.state,'NO_GOAL_WITHIN_SEARCH');
  assert.deepEqual(r.proposal.steps,[]);
  assert.equal(r.search.rejected.invariant,1);
});

test('bounded search does not claim impossibility',()=>{
  const s=fixture();s.maxNodes=1;
  const r=simulateDeus0(s);
  assert.equal(r.exhaustive,false);
  assert.equal(r.state,'NO_GOAL_WITHIN_SEARCH');
  assert.ok(r.search.pending>0);
});

test('fails closed on unsafe or malformed programs',()=>{
  const a=fixture();a.actions[0].execute=()=>{};
  assert.throws(()=>simulateDeus0(a),/EXTERNAL_EXECUTION_FORBIDDEN/);
  const b=fixture();b.actions[0].delta.time=Number.POSITIVE_INFINITY;
  assert.throws(()=>simulateDeus0(b),/DELTA_INVALID_METRIC/);
  const c=fixture();c.initial.time=-1;
  assert.throws(()=>simulateDeus0(c),/INITIAL_BREAKS_INVARIANTS/);
});

test('explicit Worldline hypothesis append is labelled and receipt-bound',()=>{
  const report=simulateDeus0(fixture());
  const events=[];
  const worldline={revision:()=> 'root', append:(e,rev)=>{events.push(e);return {ok:true,revision:'r1',expected:rev};}};
  const stored=recordDeus0Hypothesis(worldline,report);
  assert.equal(stored.ok,true);
  assert.equal(events[0].kind,'simulation');
  assert.equal(events[0].epistemic,'hypothetical');
  assert.equal(events[0].evidence.realWorldVerified,false);
  assert.equal(events[0].scope,'simulation');
  const tampered={...report,proposal:{...report.proposal,cost:-1}};
  assert.equal(recordDeus0Hypothesis(worldline,tampered).code,'DEUS0_RECEIPT_INVALID');
  assert.equal(events.length,1);
});

test('risk and cost favour safer plan when both satisfy goal',()=>{
  const spec={id:'safer',initial:{x:0},goals:{x:{min:1}},horizon:1,actions:[
    {id:'alpha_risky',delta:{x:1},risk:0.9,cost:0},
    {id:'zeta_safe',delta:{x:1},risk:0.01,cost:10}
  ]};
  assert.deepEqual(simulateDeus0(spec).proposal.steps,['zeta_safe']);
});
