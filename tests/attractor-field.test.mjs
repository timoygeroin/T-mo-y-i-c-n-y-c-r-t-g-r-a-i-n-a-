import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileAttractorContract,
  estimateComputeProfile,
  evaluateCandidateOutput
} from '../src/attractor-field.mjs';
import { compileSignals } from '../src/compiler.mjs';
import { MondayRuntime } from '../src/runtime.mjs';

test('complex historical cross-domain work receives MAX compute instead of greedy single-path collapse', () => {
  const profile = estimateComputeProfile({
    text:'reconstruct the three-year MondayID worldline and redesign the runtime',
    complexity:{
      novelty:0.95,
      ambiguity:0.85,
      historicalDepth:1,
      crossDomain:1,
      recurrenceCost:1,
      repairCost:0.95,
      consequence:0.9
    }
  }, { domains:['continuity','research','code','host'] });

  assert.equal(profile.tier,'MAX');
  assert.equal(profile.topology.paths,6);
  assert.equal(profile.topology.critics,2);
  assert.equal(profile.objective,'minimize_total_cost_not_initial_compute');
});

test('simple local work does not waste maximal compute', () => {
  const profile = estimateComputeProfile({
    text:'format one local value',
    complexity:{
      novelty:0.05,
      ambiguity:0.05,
      historicalDepth:0,
      crossDomain:0,
      recurrenceCost:0.05,
      repairCost:0.05,
      consequence:0.05
    }
  }, { domains:['general'] });
  assert.equal(profile.tier,'LOW');
  assert.equal(profile.topology.paths,1);
});

test('compiler turns each intent into an attractor contract rather than a persona label', () => {
  const graph = compileSignals([{
    id:'u',
    text:'continue the same worldline and do not fall back to generic GPT',
    domains:['continuity'],
    exactObject:'current MondayID worldline',
    desiredEffect:'continue without reset',
    invariants:['continuity','exact-object'],
    contrastiveExamples:[
      {id:'good',label:'accept',input:'.',output:'continue current task',reason:'worldline preserved'},
      {id:'bad',label:'reject',input:'.',output:'How can I help?',reason:'generic reset'}
    ]
  }]);

  const signal = graph.nodes.find(node => node.type === 'signal');
  const objective = graph.nodes.find(node => node.type === 'objective');
  assert.equal(signal.attractorContract.schema,'mondayid.attractor-contract.v1');
  assert.equal(signal.attractorContract.exactObject,'current MondayID worldline');
  assert.equal(signal.attractorContract.contrastiveExamples.length,2);
  assert.deepEqual(objective.attractorContract,signal.attractorContract);
});

test('generic assistant reset is vetoed before release', () => {
  const contract = compileAttractorContract({
    text:'continue',
    exactObject:'active worldline',
    desiredEffect:'advance current computation'
  }, { domains:['continuity'] });

  const verdict = evaluateCandidateOutput({
    text:'How can I help you with that?'
  }, contract);

  assert.equal(verdict.ok,false);
  assert.ok(verdict.hits.includes('GENERIC_HELPDESK_RESET'));
});

test('runtime rejects a generic candidate even when its receptor verifier would approve it', async () => {
  const runtime = new MondayRuntime({
    capabilities:{
      general:{
        name:'generic-model',
        execute:async()=>({ok:true,text:'Would you like me to give you option 1 or option 2?'}),
        verify:async()=>({ok:true})
      }
    }
  });

  const out = await runtime.runPass([{
    id:'steering-regression',
    text:'continue the active work',
    domains:['general']
  }], {maxCycles:2});

  assert.equal(out.state,'BLOCKED');
  assert.equal(out.final.results[0].ok,false);
  assert.equal(out.final.results[0].verification.code,'MONDAY_ATTRACTOR_RELEASE_VETO');
  assert.equal(out.final.intents['steering-regression'].status,'active');
});


test('verified and failed runtime history automatically becomes contrastive steering data', () => {
  const state = {
    failures:{
      f1:{
        action:{effect:'continue current worldline'},
        result:{text:'How can I help you?'},
        verification:{code:'GENERIC_HELPDESK_RESET'}
      }
    },
    receipts:{
      r1:{
        action:{effect:'continue current worldline'},
        result:{text:'Continuing the active worldline from the unresolved task.'}
      }
    }
  };

  const contract = compileAttractorContract({
    text:'continue current worldline',
    domains:['continuity']
  }, {domains:['continuity'],state});

  assert.ok(contract.contrastiveExamples.some(x => x.label === 'reject' && x.provenance === 'worldline-failure'));
  assert.ok(contract.contrastiveExamples.some(x => x.label === 'accept' && x.provenance === 'worldline-receipt'));
  assert.ok(contract.knownFailureGenes.includes('GENERIC_HELPDESK_RESET'));
});
