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

const liveEnv={
  MONDAYID_MODEL_EXECUTION_ENABLED:'true',
  MONDAYID_API_SPEND_ENABLED:'true',
  MONDAYID_MAX_OUTPUT_TOKENS:'512',
  MONDAYID_MAX_INPUT_CHARS:'12000',
  MONDAYID_MAX_PARALLEL_PATHS:'2',
  MONDAYID_MAX_CRITICS:'1',
  MONDAYID_WORLDLINE_URL:'https://worldline.test',
  MONDAYID_OPENAI_MODEL:'gpt-6.1-sol'
};

test('chat host is disabled by default so deployment cannot silently spend API credits', async () => {
  const out=await runChatHost({signal:{text:'hello'},env:{}});
  assert.equal(out.ok,false);
  assert.equal(out.code,'MODEL_EXECUTION_DISABLED');
});

test('model execution flag alone cannot authorize API spend', async () => {
  const out=await runChatHost({
    signal:{text:'hello'},
    env:{MONDAYID_MODEL_EXECUTION_ENABLED:'true'}
  });
  assert.equal(out.ok,false);
  assert.equal(out.code,'API_SPEND_NOT_AUTHORIZED');
});

test('live inference requires explicit bounded budget configuration', async () => {
  const out=await runChatHost({
    signal:{text:'hello'},
    env:{
      MONDAYID_MODEL_EXECUTION_ENABLED:'true',
      MONDAYID_API_SPEND_ENABLED:'true'
    }
  });
  assert.equal(out.ok,false);
  assert.equal(out.code,'MODEL_BUDGET_CONFIG_REQUIRED');
});

test('chat host requires trusted external worldline after spend and budget gates pass', async () => {
  const out=await runChatHost({
    signal:{text:'hello'},
    env:{...liveEnv,MONDAYID_WORLDLINE_URL:''}
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
    env:liveEnv,
    fetchImpl:worldlineFetch,
    provider
  });

  assert.equal(out.ok,true);
  assert.equal(out.state,'FULFILLED');
  assert.equal(out.surface.released,true);
  assert.equal(out.surface.message,'Continuing the exact Monday worldline.');
  assert.equal(out.compute.tier,'LOW');
  assert.deepEqual(out.budget,{maxOutputTokens:512,maxInputChars:12000,maxParallelPaths:2,maxCritics:1});
  assert.equal(calls.length,1);
  assert.match(calls[0].instructions,/EXACT OBJECT: current Monday worldline/);
});

test('chat host refuses a generic-helpdesk candidate instead of leaking it to the surface', async () => {
  const provider={
    async generate(){return {ok:true,text:'How can I help you with that?'};}
  };

  const out=await runChatHost({
    signal:{id:'u2',text:'continue',computeTier:'LOW'},
    env:liveEnv,
    fetchImpl:worldlineFetch,
    provider
  });

  assert.equal(out.ok,false);
  assert.equal(out.state,'BLOCKED');
  assert.equal(out.surface.released,false);
});


test('fulfilled chat host returns a durable normalized receipt for native clients', async () => {
  const provider={
    async generate(){return {ok:true,text:'Bound native response',evidence:{provider:'mock-provider'}};}
  };
  const out=await runChatHost({
    signal:{id:'native',text:'continue',computeTier:'LOW'},
    env:liveEnv,
    fetchImpl:worldlineFetch,
    provider
  });
  assert.equal(out.ok,true);
  assert.equal(out.receipt.id,'action:native:general');
  assert.equal(out.receipt.durable,false);
  assert.equal(out.receipt.persistence,'NOT_VERIFIED');
  assert.equal(typeof out.receipt.revision,'string');
  assert.ok(out.receipt.revision.length>0);
  assert.ok(out.receipt.provider);
  assert.equal(out.surface.message,'Bound native response');
});


test('chat host defaults to GPT-6.1 Sol while preserving existing gates', async () => {
  const calls=[];
  const {MONDAYID_OPENAI_MODEL, ...env}=liveEnv;
  const provider={
    async generate(request){
      calls.push(request);
      return {ok:true,text:'Continue MondayID with verified current Worldline.'};
    },
    async critique(){return {ok:true,score:1,reasons:[]};}
  };
  assert.equal(MONDAYID_OPENAI_MODEL,'gpt-6.1-sol');
  const blocked=await runChatHost({signal:{text:'continue'},env:{...env,MONDAYID_API_SPEND_ENABLED:'false'},provider});
  assert.equal(blocked.code,'API_SPEND_NOT_AUTHORIZED');
  assert.equal(calls.length,0);
  const out=await runChatHost({
    signal:{id:'gpt6',text:'continue',computeTier:'LOW'},
    env,
    fetchImpl:worldlineFetch,
    provider
  });
  assert.equal(out.ok,true);
  assert.equal(calls[0].model,'gpt-6.1-sol');
  assert.equal(out.receipt.provider,'gpt-6.1-sol');
});

test('authenticated external write and exact readback are needed for durable chat receipt', async () => {
  const writes=[];
  let stored;
  const provider={
    async generate(){return {ok:true,text:'Bound native response',evidence:{provider:'mock-provider'}};}
  };
  const fetchImpl=async (url,init)=>{
    const u=new URL(String(url));
    if(u.pathname==='/worldline/v4/snapshot') return {
      ok:true,status:200,json:async()=>trustedSnapshot
    };
    if(u.pathname==='/worldline/v4/append'){
      assert.equal(init.headers.authorization,'Bearer writer-secret');
      stored=JSON.parse(init.body);
      writes.push(stored);
      return {ok:true,status:201,json:async()=>({ok:true,status:'INSERTED'})};
    }
    if(u.pathname==='/worldline/v4/event'){
      assert.equal(init.headers.authorization,'Bearer reader-secret');
      return {ok:true,status:200,json:async()=>({
        schema:'mondayid.worldline.event.v0.4.0',
        event:{...stored,writerKeyId:'trusted-key-1'},
        conflicts:[]
      })};
    }
    throw new Error('Unexpected URL: '+u.pathname);
  };
  const out=await runChatHost({
    signal:{id:'durable-1',text:'private request',computeTier:'LOW'},
    env:{...liveEnv,MONDAYID_WORLDLINE_WRITER_TOKEN:'writer-secret',
      MONDAYID_WORLDLINE_READ_TOKEN:'reader-secret'},
    fetchImpl,provider
  });
  assert.equal(out.ok,true);
  assert.equal(out.receipt.durable,true);
  assert.equal(out.receipt.persistence,'EXTERNAL_EXACT_READBACK');
  assert.equal(out.receipt.verification.writerKeyId,'trusted-key-1');
  assert.equal(writes.length,1);
  assert.equal(JSON.stringify(writes).includes('private request'),false);
  assert.equal(JSON.stringify(writes).includes('Bound native response'),false);
  assert.equal(JSON.stringify(writes).includes('writer-secret'),false);
});

test('a successful write without matching independent readback is not durable', async () => {
  let stored;
  const provider={async generate(){return {ok:true,text:'Bound native response'};}};
  const fetchImpl=async (url,init)=>{
    const u=new URL(String(url));
    if(u.pathname==='/worldline/v4/snapshot') return {
      ok:true,status:200,json:async()=>trustedSnapshot
    };
    if(u.pathname==='/worldline/v4/append'){
      stored=JSON.parse(init.body);
      return {ok:true,status:201,json:async()=>({ok:true,status:'INSERTED'})};
    }
    if(u.pathname==='/worldline/v4/event') return {
      ok:true,status:200,json:async()=>({
        schema:'mondayid.worldline.event.v0.4.0',
        event:{...stored,valueJson:'tampered',writerKeyId:'trusted-key-1'},
        conflicts:[]
      })
    };
    throw new Error('Unexpected URL');
  };
  const out=await runChatHost({
    signal:{id:'durable-2',text:'private request',computeTier:'LOW'},
    env:{...liveEnv,MONDAYID_WORLDLINE_WRITER_TOKEN:'writer-secret',
      MONDAYID_WORLDLINE_READ_TOKEN:'reader-secret'},
    fetchImpl,provider
  });
  assert.equal(out.ok,true);
  assert.equal(out.receipt.durable,false);
  assert.equal(out.receipt.persistence,'UNVERIFIED');
  assert.equal(out.receipt.verification,null);
});


test('Behavior Bridge stops a user STOP_ALL without inference or a budget gate', async () => {
  let calls=0;
  const provider={async generate(){calls++;return {ok:true,text:'Should not happen'};}};
  const out=await runChatHost({signal:{goalKey:'PREMIERE',text:'stop',directive:'STOP_ALL'},env:liveEnv,provider});
  assert.equal(out.ok,false);
  assert.equal(out.state,'STOPPED');
  assert.equal(out.code,'USER_STOP_ALL');
  assert.equal(calls,0);
});

test('Behavior Bridge reroutes an inherited mock dashboard before calling the model', async () => {
  const calls=[];
  const provider={async generate(req){calls.push(req);return {ok:true,text:'A verified bounded result.'};}};
  const out=await runChatHost({
    signal:{id:'premiere-1',text:'Покажи презентацию Monday',goalKey:'PREMIERE',proposedFamily:'MOCK_UI',computeTier:'LOW'},
    env:liveEnv,fetchImpl:worldlineFetch,provider
  });
  assert.equal(out.ok,true);
  assert.equal(out.behavior.preflight.state,'REROUTED');
  assert.equal(out.behavior.preflight.selectedFamily,'VERIFIABLE_EFFECT');
  assert.equal(calls.length,1);
  assert.match(calls[0].instructions,/functioning, verified effects/);
});

test('Behavior Bridge rejects a repeated picture-only premiere even if provider says success', async () => {
  const provider={async generate(){return {ok:true,text:'Вот картинка интерфейса Monday'};}};
  const out=await runChatHost({
    signal:{id:'premiere-2',text:'Покажи презентацию Monday',goalKey:'PREMIERE',computeTier:'LOW'},
    env:liveEnv,fetchImpl:worldlineFetch,provider
  });
  assert.equal(out.ok,false);
  assert.equal(out.surface.released,false);
  assert.equal(out.surface.message,null);
  assert.equal(out.behavior.gate.code,'KNOWN_MOCK_PRESENTATION_RECURRED');
  assert.equal(out.receipt,null);
});

test('Behavior Bridge withholds an unsupported full activation claim', async () => {
  const provider={async generate(){return {ok:true,text:'Все модули полностью активированы.'};}};
  const out=await runChatHost({
    signal:{id:'premiere-3',text:'Покажи презентацию Monday',goalKey:'PREMIERE',computeTier:'LOW'},
    env:liveEnv,fetchImpl:worldlineFetch,provider
  });
  assert.equal(out.ok,false);
  assert.equal(out.surface.message,null);
  assert.equal(out.behavior.gate.code,'UNSUPPORTED_GLOBAL_ACTIVATION');
  assert.equal(out.receipt,null);
});


test('finish-only host releases completion only after independent exact effect readback',async()=>{
  let executionCount=0,readerCount=0;
  const domainActuator={
    name:'trusted-domain-actuator',
    async execute(){executionCount++;return {ok:true,text:'Effect independently observed.'};},
    async verify(){return {ok:true,mode:'external-exact-readback',evidenceRef:'actuator:readback'};}
  };
  const signal={
    id:'terminal-real-1',text:'Закончи и сдай проверенный эффект.',
    finishOnly:true,requireDomainReceptor:true,computeTier:'LOW',
    obligations:[{
      binding:'obligation',id:'one',domain:'general',
      status:'OPEN',effect:'Perform a bounded effect',
      requiredVerificationMode:'external-exact-readback'
    }]
  };
  const out=await runChatHost({
    signal,env:liveEnv,fetchImpl:worldlineFetch,
    provider:{async generate(){throw Error('model not needed');}},
    domainReceptors:{general:domainActuator},
    async independentReadback({action}){
      readerCount++;
      return {ok:true,effectId:action.id,domain:action.domain,
        sourceSignal:action.sourceSignal,evidenceRef:'external:exact:one'};
    }
  });
  assert.equal(executionCount,1);
  assert.equal(readerCount,1);
  assert.equal(out.ok,true);
  assert.equal(out.surface.released,true);
  assert.equal(out.behavior.preflight.goalKey,undefined);
  assert.equal(out.behavior.gate.code,'BOUNDED_RELEASE');
  assert.equal(out.completionProof.verified,true);
  assert.deepEqual([...out.completionProof.evidenceRefs],['external:exact:one']);
});

test('finish-only host with no independent reader fails closed, not as a false completion',async()=>{
  const domainActuator={
    name:'self-verifying-actuator',
    async execute(){return {ok:true,text:'I finished.'};},
    async verify(){return {ok:true,mode:'external-exact-readback',evidenceRef:'self:claimed'};}
  };
  const out=await runChatHost({
    signal:{
      id:'terminal-false-1',text:'Заверши эффект.',finishOnly:true,
      requireDomainReceptor:true,computeTier:'LOW',
      obligations:[{
        binding:'obligation',id:'one',domain:'general',status:'OPEN',
        effect:'A verifiable effect',requiredVerificationMode:'external-exact-readback'
      }]
    },
    env:liveEnv,fetchImpl:worldlineFetch,
    provider:{async generate(){throw Error('model not needed');}},
    domainReceptors:{general:domainActuator}
  });
  assert.equal(out.ok,false);
  assert.equal(out.surface.released,false);
  assert.equal(out.completionProof.verified,false);
  assert.equal(out.receipt,null);
});


test('live host passes shared-effect interpretation field into provider steering', async () => {
  const calls=[];
  const provider={
    async generate(request){calls.push(request);return {ok:true,text:'Continuing existing MondayID runtime.'};},
    async critique(){return {ok:true,score:1,reasons:[]};}
  };
  const out=await runChatHost({
    signal:{
      id:'interpretation-transfer-001',text:'Интегрируй mondayiD',computeTier:'LOW',
      interpretations:[
        {id:'one',meaning:'preserve continuity',effect:'continue existing MondayID'},
        {id:'two',meaning:'connect execution organs',effect:'continue existing MondayID'}
      ]
    },
    env:liveEnv,fetchImpl:worldlineFetch,provider
  });
  assert.equal(out.ok,true);
  assert.ok(calls.length>0);
  assert.match(calls[0].instructions,/COMMON EFFECT: continue existing MondayID/);
  assert.match(calls[0].instructions,/POSSIBLE INTENT FIELD/);
  assert.equal(out.receipt.durable,false);
});

test('live host retains an unresolved interpretation fork without forcing a single action', async () => {
  const calls=[];
  const provider={async generate(req){calls.push(req);return {ok:true,text:'Checking the existing state without making an external change.'};}};
  const out=await runChatHost({
    signal:{id:'interpretation-fork-001',text:'integrate',computeTier:'LOW',interpretations:[
      {meaning:'merge code',effect:'update repo'},
      {meaning:'connect account',effect:'change external account'}
    ]},
    env:liveEnv,fetchImpl:worldlineFetch,provider
  });
  assert.equal(out.ok,true);
  assert.match(calls[0].instructions,/OPEN FORK:/);
  assert.doesNotMatch(calls[0].instructions,/COMMON EFFECT:/);
});


test('live host actually selects common effect as model input when original text is ambiguous',async()=>{
  const calls=[];
  const provider={async generate(request){calls.push(request);return {ok:true,text:'Existing MondayID continuation.'};}};
  const out=await runChatHost({
    signal:{
      id:'selected-invariant-001',text:'Интегрируй mondayiD',computeTier:'LOW',
      interpretations:[
        {meaning:'continuity',effect:'advance existing MondayID'},
        {meaning:'integration',effect:'advance existing MondayID'}
      ]
    },
    env:liveEnv,fetchImpl:worldlineFetch,provider
  });
  assert.equal(out.ok,true);
  assert.equal(calls[0].input,'advance existing MondayID');
  assert.match(calls[0].instructions,/COMMON EFFECT: advance existing MondayID/);
});

test('live host preserves direct user effect instead of replacing it with candidate inference',async()=>{
  const calls=[];
  const provider={async generate(request){calls.push(request);return {ok:true,text:'Audit complete at bounded scope.'};}};
  const out=await runChatHost({
    signal:{id:'explicit-owner-001',text:'audit it',effect:'audit only',computeTier:'LOW',
      interpretations:[{meaning:'possible route',effect:'deploy now'}]
    },
    env:liveEnv,fetchImpl:worldlineFetch,provider
  });
  assert.equal(out.ok,true);
  assert.equal(calls[0].input,'audit only');
});


test('whole-system signal cannot collapse to a general model echo (2026-11-01)',async()=>{
  let modelCalls=0;
  const out=await runChatHost({
    signal:{id:'whole-system-no-echo',text:'Пересобери всю систему MondayID',computeTier:'LOW'},
    env:liveEnv,fetchImpl:worldlineFetch,
    provider:{async generate(){modelCalls++;return {ok:true,text:'Everything repaired.'};}}
  });
  assert.equal(modelCalls,0);
  assert.equal(out.ok,false);
  assert.equal(out.surface.released,false);
  assert.equal(out.receipt,null);
});

test('multi-domain material obligations preserve domains instead of becoming general inference',async()=>{
  let modelCalls=0;
  const out=await runChatHost({
    signal:{id:'material-multi',text:'Apply and independently verify both changes',
      computeTier:'LOW',finishOnly:true,domains:['general'],
      obligations:[
        {id:'code-fix',binding:'obligation',domain:'code',status:'OPEN',material:true,effect:'Commit code repair',requiredVerificationMode:'external-exact-readback'},
        {id:'host-fix',binding:'obligation',domain:'host',status:'OPEN',material:true,effect:'Verify running host',requiredVerificationMode:'external-exact-readback'}
      ]},
    env:liveEnv,fetchImpl:worldlineFetch,
    provider:{async generate(){modelCalls++;return {ok:true,text:'I fixed everything.'};}}
  });
  assert.equal(modelCalls,0);
  assert.equal(out.ok,false);
  assert.equal(out.surface.released,false);
  assert.equal(out.completionProof.verified,false);
  assert.equal(out.receipt,null);
});

test('even a material general obligation cannot be satisfied by text generation',async()=>{
  let modelCalls=0;
  const out=await runChatHost({
    signal:{id:'material-general',text:'Execute and prove a real general effect',
      computeTier:'LOW',finishOnly:true,
      obligations:[{id:'real-effect',binding:'obligation',domain:'general',status:'OPEN',
        effect:'An external observable effect',requiredVerificationMode:'external-exact-readback'}]},
    env:liveEnv,fetchImpl:worldlineFetch,
    provider:{async generate(){modelCalls++;return {ok:true,text:'Done.'};}}
  });
  assert.equal(modelCalls,0);
  assert.equal(out.ok,false);
  assert.equal(out.completionProof.verified,false);
});

test('trusted domain receptor plus separate reader satisfies the preserved code obligation',async()=>{
  let modelCalls=0,executions=0,reads=0;
  const out=await runChatHost({
    signal:{id:'material-code-positive',text:'Execute one code effect and verify',computeTier:'LOW',
      finishOnly:true,obligations:[{id:'one',binding:'obligation',domain:'code',
        status:'OPEN',effect:'Real bounded code change',requiredVerificationMode:'external-exact-readback'}]},
    env:liveEnv,fetchImpl:worldlineFetch,
    provider:{async generate(){modelCalls++;throw Error('Never use the model as a code actuator');}},
    domainReceptors:{code:{
      name:'trusted-code-receptor',
      async execute(){executions++;return {ok:true,text:'Bounded code effect confirmed by receptor.'};},
      async verify(){return {ok:true,mode:'external-exact-readback',evidenceRef:'code:internal:readback'};}
    }},
    async independentReadback({action}){
      reads++;return {ok:true,effectId:action.id,domain:action.domain,
        sourceSignal:action.sourceSignal,evidenceRef:'code:independent:readback'};
    }
  });
  assert.equal(modelCalls,0);
  assert.equal(executions,1);
  assert.equal(reads,1);
  assert.equal(out.ok,true);
  assert.equal(out.surface.released,true);
  assert.equal(out.completionProof.verified,true);
  assert.deepEqual([...out.completionProof.evidenceRefs],['code:independent:readback']);
});
