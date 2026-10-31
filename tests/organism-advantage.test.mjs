import test from 'node:test';
import assert from 'node:assert/strict';
import { compileAttractorContract } from '../src/attractor-field.mjs';
import { createModelReceptor } from '../src/model-receptor.mjs';

const actionFor = (overrides={}) => {
  const signal={
    text:'continue without making me reconstruct the project',
    exactObject:'active MondayID worldline',
    desiredEffect:'advance the unfinished task without reset',
    invariants:['continuity','exact-object'],
    contrastiveExamples:[
      {label:'accept',input:'.',output:'I resumed the exact unfinished task and executed the next admissible move.',reason:'continues'},
      {label:'reject',input:'.',output:'What would you like to do?',reason:'fresh-chat reset'}
    ],
    knownFailureGenes:['GENERIC_HELPDESK_RESET'],
    computeTier:'HIGH',
    ...overrides
  };
  return {
    id:'action:organism-advantage',
    domain:'general',
    effect:signal.desiredEffect,
    inferenceContract:compileAttractorContract(signal,{domains:['general']})
  };
};

test('same provider can prove organism advantage when single-cell falls into a known basin', async()=>{
  const calls=[];
  const provider={
    async generate(input){
      calls.push(input);
      if(input.mode==='single-cell-baseline') return {text:'What would you like me to do next?'};
      return {text:'I resumed the unfinished task and executed the next admissible move.'};
    },
    async critique(){ return {ok:true,score:1}; }
  };
  const receptor=createModelReceptor({provider,maxParallelPaths:2,maxCritics:1});
  const result=await receptor.compareAgainstSingleCell(actionFor());

  assert.equal(result.ok,true);
  assert.equal(result.advantage.state,'PROVEN_ORGANISM_ADVANTAGE');
  assert.equal(result.advantage.baseline.release.ok,false);
  assert.equal(result.advantage.organism.release.ok,true);
  assert.equal(calls.filter(x=>x.mode==='single-cell-baseline').length,1);
  assert.ok(calls.filter(x=>x.mode!=='single-cell-baseline').length>=1);
});

test('organism is forbidden from claiming superiority when both routes pass', async()=>{
  const provider={
    async generate(input){
      if(input.mode==='single-cell-baseline') return {text:'I resumed the unfinished task and executed the next admissible move.'};
      return {text:'I resumed the unfinished task and executed the next admissible move.'};
    },
    async critique(){ return {ok:true,score:1}; }
  };
  const receptor=createModelReceptor({provider,maxParallelPaths:1,maxCritics:0});
  const result=await receptor.compareAgainstSingleCell(actionFor({computeTier:'LOW'}));

  assert.equal(result.advantage.state,'PARITY_NOT_ADVANTAGE');
  assert.equal(result.advantage.claimAllowed,false);
});

test('single-cell win is recorded as organism regression, never hidden', async()=>{
  const provider={
    async generate(input){
      if(input.mode==='single-cell-baseline') return {text:'I resumed the unfinished task and executed the next admissible move.'};
      return {text:'What would you like me to do next?'};
    }
  };
  const receptor=createModelReceptor({provider,maxParallelPaths:1,maxCritics:0});
  const result=await receptor.compareAgainstSingleCell(actionFor({computeTier:'LOW'}));

  assert.equal(result.advantage.state,'ORGANISM_REGRESSION');
  assert.equal(result.ok,false);
  assert.equal(result.advantage.claimAllowed,false);
});

test('single-cell baseline receives no lineage, failure genome, contrastive history or phenotype instructions', async()=>{
  let baselineCall=null;
  const provider={
    async generate(input){
      if(input.mode==='single-cell-baseline'){
        baselineCall=input;
        return {text:'What would you like me to do next?'};
      }
      return {text:'I resumed the unfinished task and executed the next admissible move.'};
    }
  };
  const receptor=createModelReceptor({provider,maxParallelPaths:1,maxCritics:0});
  await receptor.compareAgainstSingleCell(actionFor({computeTier:'LOW'}));

  assert.ok(baselineCall);
  assert.equal(baselineCall.contract,null);
  assert.doesNotMatch(baselineCall.instructions,/LINEAGE|FAILURE|VISIBLE LETTER|CONTRASTIVE|MONDAYID/i);
  assert.match(baselineCall.instructions,/current task only/i);
});
