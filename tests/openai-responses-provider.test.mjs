import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAIResponsesProvider } from '../src/providers/openai-responses-provider.mjs';

const fakeResponse = payload => ({
  ok:true,
  status:200,
  statusText:'OK',
  async text(){ return JSON.stringify(payload); }
});

test('Responses provider sends nested reasoning.effort, token budget, and never flat reasoning_effort', async () => {
  const calls=[];
  const provider=new OpenAIResponsesProvider({
    apiKey:'test-key',
    maxOutputTokens:321,
    maxInputChars:2000,
    fetchImpl:async (url,init)=>{
      calls.push({url,body:JSON.parse(init.body),headers:init.headers});
      return fakeResponse({
        id:'resp_1',
        model:'gpt-5.6-sol',
        output:[{type:'message',content:[{type:'output_text',text:'Monday output'}]}],
        usage:{total_tokens:123}
      });
    }
  });

  const result=await provider.generate({
    model:'gpt-5.6-sol',
    input:'continue',
    instructions:'steer',
    reasoningEffort:'max',
    pathIndex:0,
    pathCount:6,
    contract:{schema:'mondayid.attractor-contract.v1',compute:{tier:'MAX'}}
  });

  assert.equal(result.ok,true);
  assert.equal(result.text,'Monday output');
  assert.equal(calls.length,1);
  assert.equal(calls[0].body.reasoning.effort,'max');
  assert.equal(calls[0].body.reasoning.context,'all_turns');
  assert.equal(calls[0].body.reasoning.mode,'standard');
  assert.equal('reasoning_effort' in calls[0].body,false);
  assert.equal(calls[0].body.max_output_tokens,321);
  assert.equal(calls[0].body.store,false);
  assert.equal(calls[0].body.metadata.monday_path,'1/6');
  assert.equal(result.evidence.budget.maxOutputTokens,321);
  assert.ok(result.evidence.budget.inputChars>0);
});

test('provider fails closed without an API key instead of pretending model execution', async () => {
  const provider=new OpenAIResponsesProvider({apiKey:null,fetchImpl:async()=>{throw new Error('must not call');}});
  await assert.rejects(
    () => provider.generate({input:'x',instructions:'y'}),
    /OPENAI_API_KEY_MISSING/
  );
});

test('provider refuses prompts larger than the configured input budget before network execution', async () => {
  let called=false;
  const provider=new OpenAIResponsesProvider({
    apiKey:'test-key',
    maxInputChars:10,
    fetchImpl:async()=>{called=true; return fakeResponse({});}
  });
  await assert.rejects(
    () => provider.generate({input:'1234567890',instructions:'extra'}),
    /OPENAI_INPUT_BUDGET_EXCEEDED/
  );
  assert.equal(called,false);
});

test('critic uses MAX effort for a MAX Monday contract and has a separate output cap', async () => {
  const calls=[];
  const provider=new OpenAIResponsesProvider({
    apiKey:'test-key',
    criticOutputTokens:77,
    fetchImpl:async (url,init)=>{
      calls.push(JSON.parse(init.body));
      return fakeResponse({
        id:'resp_critic',
        output:[{type:'message',content:[{type:'output_text',text:'{"ok":true,"score":0.94,"reasons":[]}'}]}]
      });
    }
  });

  const verdict=await provider.critique({
    candidate:{text:'continue exact task'},
    contract:{
      schema:'mondayid.attractor-contract.v1',
      exactObject:'task',
      desiredEffect:'finish task',
      compute:{tier:'MAX'}
    },
    criticIndex:0,
    criticCount:2
  });

  assert.equal(verdict.ok,true);
  assert.equal(verdict.score,0.94);
  assert.equal(calls[0].reasoning.effort,'max');
  assert.equal(calls[0].reasoning.context,'current_turn');
  assert.equal(calls[0].max_output_tokens,77);
});

test('HTTP errors remain blockers with the upstream reason intact', async () => {
  const provider=new OpenAIResponsesProvider({
    apiKey:'test-key',
    fetchImpl:async()=>({
      ok:false,
      status:429,
      statusText:'Too Many Requests',
      async text(){return JSON.stringify({error:{message:'credit_balance_exhausted'}});}
    })
  });

  await assert.rejects(
    () => provider.generate({input:'x',instructions:'y'}),
    /OPENAI_RESPONSES_HTTP_429:credit_balance_exhausted/
  );
});
