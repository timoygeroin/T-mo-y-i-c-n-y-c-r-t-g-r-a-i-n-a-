import test from 'node:test';
import assert from 'node:assert/strict';
import { runChatHost } from '../src/chat-host-adapter.mjs';

const trustedSnapshot={
  schema:'mondayid.worldline.snapshot.v0.4.0',
  trust:'AUTHENTICATED_MACHINE_WRITER',
  readOnly:true,
  generatedAtIso:'2026-09-24T00:00:00Z',
  events:[],
  conflictProbe:{conflicts:[]}
};

const worldlineFetch=async()=>({
  ok:true,
  status:200,
  async json(){return trustedSnapshot;}
});

test('chat host is disabled by default so deployment cannot silently spend API credits', async () => {
  const out=await runChatHost({signal:{text:'hello'},env:{}});
  assert.equal(out.ok,false);
  assert.equal(out.code,'MODEL_EXECUTION_DISABLED');
});

test('chat host requires trusted external worldline before model execution', async () => {
  const out=await runChatHost({
    signal:{text:'hello'},
    env:{MONDAYID_MODEL_EXECUTION_ENABLED:'true',OPENAI_API_KEY:'x'}
  });
  assert.equal(out.ok,false);
  assert.equal(out.code,'WORLDLINE_URL_MISSING');
});

test('enabled chat host routes through Monday attractor and releases only verified candidate', async () => {
  const calls=[];
  const provider={
    async generate(request){
      calls.push(request);
      return {ok:true,text:'Continuing the exact Monday worldline.',evidence:{mock:true}};
    },
    async critique(){return {ok:true,score:1,reasons:[]};}
  };

  const out=await runChatHost({
    signal:{
      id:'u1',
      text:'continue',
      exactObject:'current Monday worldline',
      desiredEffect:'continue without reset',
      computeTier:'LOW'
    },
    env:{
      MONDAYID_MODEL_EXECUTION_ENABLED:'true',
      MONDAYID_WORLDLINE_URL:'https://worldline.test',
      MONDAYID_OPENAI_MODEL:'gpt-5.6-sol'
    },
    fetchImpl:worldlineFetch,
    provider
  });

  assert.equal(out.ok,true);
  assert.equal(out.state,'FULFILLED');
  assert.equal(out.surface.released,true);
  assert.equal(out.surface.message,'Continuing the exact Monday worldline.');
  assert.equal(out.compute.tier,'LOW');
  assert.equal(calls.length,1);
  assert.match(calls[0].instructions,/EXACT OBJECT: current Monday worldline/);
});

test('chat host refuses a generic-helpdesk candidate instead of leaking it to the surface', async () => {
  const provider={
    async generate(){return {ok:true,text:'How can I help you with that?'};}
  };

  const out=await runChatHost({
    signal:{id:'u2',text:'continue',computeTier:'LOW'},
    env:{
      MONDAYID_MODEL_EXECUTION_ENABLED:'true',
      MONDAYID_WORLDLINE_URL:'https://worldline.test'
    },
    fetchImpl:worldlineFetch,
    provider
  });

  assert.equal(out.ok,false);
  assert.equal(out.state,'BLOCKED');
  assert.equal(out.surface.released,false);
});
