import test from 'node:test';
import assert from 'node:assert/strict';
import { compileAttractorContract } from '../src/attractor-field.mjs';
import { buildSteeringEnvelope, createModelReceptor } from '../src/model-receptor.mjs';

const actionFor = (overrides = {}) => {
  const signal = {
    text:'continue the active Monday worldline',
    exactObject:'active MondayID worldline',
    desiredEffect:'advance the unfinished task without reset',
    invariants:['continuity','exact-object'],
    contrastiveExamples:[
      {label:'accept',input:'.',output:'Continuing the unresolved task.',reason:'preserves worldline'},
      {label:'reject',input:'.',output:'How can I help?',reason:'generic reset'}
    ],
    computeTier:'HIGH',
    ...overrides
  };
  const contract = compileAttractorContract(signal,{domains:['general']});
  return {
    id:'action:test',
    domain:'general',
    effect:signal.desiredEffect,
    inferenceContract:contract
  };
};

test('model envelope turns Monday state into task-local steering instead of a persona label', () => {
  const envelope = buildSteeringEnvelope(actionFor());
  assert.equal(envelope.schema,'mondayid.model-steering-envelope.v1');
  assert.match(envelope.instruction,/EXACT OBJECT: active MondayID worldline/);
  assert.match(envelope.instruction,/ACCEPTED EXAMPLE/);
  assert.match(envelope.instruction,/REJECTED EXAMPLE/);
  assert.doesNotMatch(envelope.instruction,/pretend you are Monday/i);
});

test('compute tier controls path count and reasoning effort at the provider boundary', async () => {
  const calls=[];
  const provider={
    async generate(input){
      calls.push(input);
      return {text:`candidate-${input.pathIndex}`,evidence:{provider:true}};
    },
    async critique(){ return {ok:true,score:0.8}; }
  };
  const receptor=createModelReceptor({provider,model:'test-model'});
  const action=actionFor({computeTier:'HIGH'});
  const result=await receptor.execute(action);

  assert.equal(result.ok,true);
  assert.equal(calls.length,4);
  assert.ok(calls.every(call => call.reasoningEffort === 'high'));
  assert.equal(result.evidence.computeTier,'HIGH');
  assert.equal(result.evidence.pathCount,4);
});

test('generic candidate is killed before provider verification and cannot win by being first', async () => {
  const provider={
    async generate({pathIndex}){
      if (pathIndex === 0) return {text:'How can I help you with that?'};
      return {text:'Continuing the unresolved task from the active worldline.'};
    },
    async critique({candidate}){
      return {ok:true,score:candidate.text.startsWith('Continuing') ? 1 : 0};
    }
  };
  const receptor=createModelReceptor({provider});
  const action=actionFor({computeTier:'MEDIUM'});
  const result=await receptor.execute(action);
  const verified=await receptor.verify(result,action);

  assert.equal(result.ok,true);
  assert.match(result.text,/Continuing/);
  assert.equal(result.attempts[0].ok,false);
  assert.ok(result.attempts[0].release.hits.includes('GENERIC_HELPDESK_RESET'));
  assert.equal(verified.ok,true);
});

test('MAX compute branches six paths and uses two independent critic passes per survivor', async () => {
  let critiques=0;
  const provider={
    async generate({pathIndex}){ return {text:`deep candidate ${pathIndex}`}; },
    async critique({criticIndex,pathIndex}) {
      void criticIndex;
      void pathIndex;
      critiques += 1;
      return {ok:true,score:0.9};
    }
  };
  const receptor=createModelReceptor({provider});
  const action=actionFor({computeTier:'MAX'});
  const result=await receptor.execute(action);

  assert.equal(result.ok,true);
  assert.equal(result.evidence.pathCount,6);
  assert.equal(result.evidence.criticCount,2);
  assert.equal(critiques,12);
});

test('all generic outputs fail closed instead of falling back to the default assistant', async () => {
  const provider={
    async generate(){ return {text:'Would you like me to give you option 1 or option 2?'}; }
  };
  const receptor=createModelReceptor({provider});
  const result=await receptor.execute(actionFor({computeTier:'MEDIUM'}));

  assert.equal(result.ok,false);
  assert.equal(result.code,'NO_MONDAY_CANDIDATE_SURVIVED');
});


test('live receptor caps path and critic fanout below the abstract MAX topology', async () => {
  let generated=0;
  let critiques=0;
  const provider={
    async generate({pathIndex}){generated+=1; return {text:`candidate ${pathIndex}`};},
    async critique(){critiques+=1; return {ok:true,score:1};}
  };
  const receptor=createModelReceptor({provider,maxParallelPaths:2,maxCritics:1});
  const result=await receptor.execute(actionFor({computeTier:'MAX'}));
  assert.equal(result.ok,true);
  assert.equal(result.evidence.pathCount,2);
  assert.equal(result.evidence.criticCount,1);
  assert.equal(generated,2);
  assert.equal(critiques,2);
});
