import test from 'node:test';
import assert from 'node:assert/strict';
import { compileVirtualCloneField } from '../src/virtual-clone-field.mjs';

const graph = nodes => ({nodes});
const objective = (i, choices) => ({type:'objective',id:'o'+i,domain:'code',routeCandidates:choices});

test('2^30 virtual combinations require only 60 route evaluations and bounded proposals',()=>{
  const nodes=Array.from({length:30},(_,i)=>objective(i,[
    {id:'a'+i,truth:1,risk:0.05},
    {id:'b'+i,truth:0.7,risk:0.1}
  ]));
  const field=compileVirtualCloneField(graph(nodes),{materializationBudget:6,sourceRevision:'rev1'});
  assert.equal(field.combinatorialUpperBound,'1073741824');
  assert.equal(field.locallyAdmissibleUpperBound,'1073741824');
  assert.equal(field.routeEvaluations,60);
  assert.equal(field.materializedProposals,6);
  assert.equal(field.inspectedCombinations,6);
  assert.equal(field.externalActions,0);
  assert.equal(field.deployedModels,0);
  assert.ok(field.proposals.every(p=>p.selections.length===30 && p.state==='PROPOSED_UNVERIFIED'));
});

test('same worldline revision yields deterministic proposals and common genome',()=>{
  const input=graph([objective(0,[{id:'a'},{id:'b'}]),objective(1,[{id:'x'},{id:'y'}])]);
  const a=compileVirtualCloneField(input,{sourceRevision:'hash123'});
  const b=compileVirtualCloneField(input,{sourceRevision:'hash123'});
  assert.deepEqual(a,b);
  assert.equal(a.proposals.length,4);
  assert.ok(a.proposals.every(p=>p.genomeRef==='mondayid:whole-organism'));
});

test('hard-vetoed irreversible route is never selected, even with high desirability',()=>{
  const g=graph([objective(0,[
    {id:'unsafe',irreversible:true,irreversibleAuthorized:false,informationGain:1},
    {id:'safe',irreversible:false,truth:1}
  ])]);
  const x=compileVirtualCloneField(g);
  assert.equal(x.combinatorialUpperBound,'2');
  assert.equal(x.locallyAdmissibleUpperBound,'1');
  assert.equal(x.proposals.length,1);
  assert.equal(x.proposals[0].selections[0].id,'safe');
  assert.deepEqual(x.routeVetoes[0].reasons,[
    'DELEGATED_AUTHORITY_GATE:UNCLASSIFIED_CONSEQUENTIAL_ROUTE',
    'IRREVERSIBLE_AUTHORITY_REQUIRED'
  ]);
});

test('no admissible route blocks all whole-program proposals',()=>{
  const x=compileVirtualCloneField(graph([objective(0,[{id:'forbidden',authorized:false}])]));
  assert.equal(x.state,'BLOCKED');
  assert.equal(x.locallyAdmissibleUpperBound,'0');
  assert.equal(x.materializedProposals,0);
});

test('zero materialization budget enumerates no candidates',()=>{
  const x=compileVirtualCloneField(graph([objective(0,[{id:'a'},{id:'b'}])]),{materializationBudget:0});
  assert.equal(x.proposalBudget,0);
  assert.equal(x.proposals.length,0);
  assert.equal(x.combinatorialUpperBound,'2');
});

test('no objectives is idle and never claims one phantom clone',()=>{
  const x=compileVirtualCloneField(graph([]));
  assert.equal(x.state,'IDLE');
  assert.equal(x.combinatorialUpperBound,'0');
  assert.equal(x.proposals.length,0);
});

test('ranked combinations are monotone in quality; duplicated proposals do not appear',()=>{
  const x=compileVirtualCloneField(graph([
    objective(0,[{id:'best',truth:1},{id:'weak',truth:0.3}]),
    objective(1,[{id:'yes',risk:0},{id:'no',risk:0.4}])
  ]));
  assert.equal(x.proposals.length,4);
  assert.equal(new Set(x.proposals.map(p=>p.id)).size,4);
  assert.ok(x.proposals.every((p,i)=>i===0 || x.proposals[i-1].score>=p.score));
});
