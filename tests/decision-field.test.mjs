import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreDecisionRoute, rankDecisionRoutes } from '../src/decision-field.mjs';
import { compileSignals } from '../src/compiler.mjs';
import { buildFrontier } from '../src/planner.mjs';

test('material uncertainty prefers a high-information low-cost experiment',()=>{
  const ranked=rankDecisionRoutes([
    {
      id:'guess',
      exactObjectMatch:1,
      desiredEffectFidelity:0.7,
      truth:0.4,
      informationGain:0.1,
      futureOptionality:0.2,
      cost:0.1,
      risk:0.4
    },
    {
      id:'probe',
      exactObjectMatch:1,
      desiredEffectFidelity:0.8,
      truth:0.95,
      informationGain:1,
      futureOptionality:0.9,
      cost:0.15,
      risk:0.05
    }
  ]);
  assert.equal(ranked[0].route.id,'probe');
});

test('among equally valid routes future optionality breaks the tie',()=>{
  const ranked=rankDecisionRoutes([
    {id:'closed',futureOptionality:0.1,informationGain:0.2},
    {id:'open',futureOptionality:0.9,informationGain:0.2}
  ]);
  assert.equal(ranked[0].route.id,'open');
});

test('hard authority veto beats any numeric score',()=>{
  const verdict=scoreDecisionRoute({
    id:'publish',
    authorized:true,
    irreversible:true,
    irreversibleAuthorized:false,
    exactObjectMatch:1,
    desiredEffectFidelity:1,
    truth:1,
    informationGain:1,
    futureOptionality:1
  });
  assert.equal(verdict.admissible,false);
  assert.ok(verdict.hardVetoes.includes('IRREVERSIBLE_AUTHORITY_REQUIRED'));
});

test('planner expands candidate routes and selects the strongest admissible route per domain',()=>{
  const graph=compileSignals([{
    id:'u',
    text:'resolve uncertain host state',
    domains:['host'],
    routeCandidates:[
      {
        id:'blind-redeploy',
        domain:'host',
        effect:'redeploy without verifying target',
        exactObjectMatch:0.5,
        desiredEffectFidelity:0.7,
        truth:0.3,
        informationGain:0,
        futureOptionality:0.2,
        cost:0.5,
        risk:0.8
      },
      {
        id:'readback-first',
        domain:'host',
        effect:'read target state then repair',
        exactObjectMatch:1,
        desiredEffectFidelity:0.95,
        truth:1,
        informationGain:1,
        futureOptionality:0.9,
        cost:0.1,
        risk:0.05
      }
    ]
  }]);
  const frontier=buildFrontier(graph,{
    host:{
      name:'host',
      supports:()=>true,
      execute:async()=>({ok:true}),
      verify:async()=>({ok:true})
    }
  });
  assert.equal(frontier.parallel.length,1);
  assert.equal(frontier.parallel[0].routeCandidate.id,'readback-first');
  assert.equal(frontier.parallel[0].effect,'read target state then repair');
});

test('planner never selects an unauthorized irreversible candidate even when its raw score is high',()=>{
  const graph=compileSignals([{
    id:'u2',
    text:'choose safe route',
    domains:['host'],
    routeCandidates:[
      {
        id:'unsafe',
        domain:'host',
        effect:'publish',
        authorized:true,
        irreversible:true,
        irreversibleAuthorized:false,
        exactObjectMatch:1,
        desiredEffectFidelity:1,
        truth:1,
        informationGain:1,
        futureOptionality:1
      },
      {
        id:'safe',
        domain:'host',
        effect:'prepare reversible draft',
        authorized:true,
        irreversible:false,
        exactObjectMatch:0.9,
        desiredEffectFidelity:0.9,
        truth:1,
        informationGain:0.5,
        futureOptionality:0.9
      }
    ]
  }]);
  const frontier=buildFrontier(graph,{
    host:{name:'host',execute:async()=>({ok:true}),verify:async()=>({ok:true})}
  });
  assert.equal(frontier.parallel[0].routeCandidate.id,'safe');
  assert.ok(frontier.blocked.some(action=>action.routeCandidate?.id==='unsafe'));
});
