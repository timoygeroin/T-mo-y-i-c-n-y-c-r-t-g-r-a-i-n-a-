import test from 'node:test';
import assert from 'node:assert/strict';
import { SharedBus, GENESIS, validateEnvelope, classifyPolicy, project, storageIdFor } from '../src/shared-bus.mjs';
import mcpHandler from '../api/mcp.mjs';

const G={principal:'grok-monday',hostBound:true};
const C={principal:'chatgpt-monday',hostBound:true};
function fakeWorldline({ tamper=false, failAppend=false, extraEvents=0, snapshotOmitsBus=false } = {}) {
  const events=[]; const writes=[]; let reads=0;
  for(let i=0;i<extraEvents;i++) events.push({predicate:'other',eventId:'X'+i});
  const fetchImpl=async(url,opts={})=>{
    const u=new URL(url);
    const j=(b,ok=true,status=200)=>({ok,status,json:async()=>b});
    if(u.pathname==='/worldline/v4/append'){
      if(opts.headers?.authorization!=='Bearer W') return j({ok:false},false,401);
      const e=JSON.parse(opts.body); writes.push(e);
      if(failAppend) throw new Error('lost response');
      events.push(tamper?{...e,valueJson:e.valueJson.replace('STORED','EXECUTED')}:e); return j({ok:true,status:'APPENDED'});
    }
    reads++;
    if(u.pathname==='/worldline/v4/snapshot'){
      const visible=snapshotOmitsBus?events.filter(e=>e.predicate!=='mondayid_bus_envelope_v2'):events;
      return j({schema:'mondayid.worldline.snapshot.v0.4.0',trust:'AUTHENTICATED_MACHINE_WRITER',readOnly:true,events:visible.slice(0,Number(u.searchParams.get('limit')))});
    }
    if(u.pathname==='/worldline/v4/event') return j({schema:'mondayid.worldline.event.v0.4.0',event:events.find(e=>e.eventId===u.searchParams.get('eventId'))??null,conflicts:[]});
    return j({},false,404);
  };
  return { events, writes, get reads(){return reads;}, bus:new SharedBus({baseUrl:'https://wl.test',writerToken:'W',fetchImpl,now:()=> '2026-10-15T00:00:00Z'}) };
}
const env=(o={})=>({eventId:'ev-1',sourceHost:'grok-monday',parentVersion:GENESIS,goalId:'MONDAY_UNIFIED_BUS',observation:{text:'o'},evidence:['e'],proposal:{text:'review architecture'},nextAction:{recipient:'chatgpt-monday',action:'critique'},status:{claim:'CANDIDATE'},...o});

test('envelope: exactly 9 fields, typed claim, secrets rejected before retention',()=>{
  assert.equal(validateEnvelope(env()).ok,true);
  assert.equal(validateEnvelope(env({status:'CANDIDATE'})).ok,true);
  const {proposal,...missing}=env(); assert.equal(validateEnvelope(missing).code,'ENVELOPE_MISSING_FIELD');
  assert.equal(validateEnvelope({...env(),extra:1}).code,'ENVELOPE_UNKNOWN_FIELDS');
  assert.equal(validateEnvelope(env({status:{claim:'VERIFIED'}})).code,'ENVELOPE_BAD_STATUS');
  for(const s of [
    '-----BEGIN PRIVATE KEY-----','-----begin rsa private key-----',
    'sk-'+'a'.repeat(30),'sk-\u200b'+'a'.repeat(24),'sk_live_'+'a'.repeat(20),'rk_test_'+'b'.repeat(16),
    'ghp_'+'a'.repeat(36),'AKIA'+'A'.repeat(16),'xoxc-'+'a'.repeat(12),'npm_'+'a'.repeat(36),
    'glpat-'+'a'.repeat(20),'{"private_key": "x"}','{"PRIVATE_KEY":"y"}',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
    'Authorization: Bearer '+ 'a'.repeat(24),'Bearer '+ 'b'.repeat(24),'ya29.'+ 'c'.repeat(24),
    'https://user:p@ss@example.com/path'
  ]) assert.equal(validateEnvelope(env({evidence:[s]})).code,'SECRET_IN_PAYLOAD',s);
  assert.equal(validateEnvelope(env({proposal:{access_token:'abcdefghijklmnop'}})).code,'SECRET_IN_PAYLOAD');
  assert.equal(validateEnvelope(env({status:{claim:'ACK'}})).code,'ACK_VIA_POST_FORBIDDEN');
  assert.equal(validateEnvelope(env({evidence:[NaN]})).code,'ENVELOPE_NON_FINITE');
  assert.equal(validateEnvelope(env({nextAction:'critique'})).code,'ENVELOPE_BAD_FIELD');
});

test('post stores the full envelope with server transport metadata; exact readback',async()=>{
  const {bus}=fakeWorldline();
  const r=await bus.post(env(),G); assert.equal(r.code,'STORED_READBACK_EXACT');
  const back=await bus.get(r.storageId);
  assert.deepEqual(back.record.envelope,env());
  assert.equal(back.record.transport.principal,'grok-monday');
  assert.equal(back.record.policy.executable,false);
  assert.equal(back.event.epistemicStatus,'CANDIDATE');
  assert.equal(back.event.predicate,'mondayid_bus_envelope_v2');
});

test('idempotency: eventId key + payload hash (BUS-REVIEW-05)',async()=>{
  const {bus,writes}=fakeWorldline();
  const a=await bus.post(env(),G); const b=await bus.post(env(),G);
  assert.equal(b.code,'DUPLICATE'); assert.equal(b.storageId,a.storageId); assert.equal(writes.length,1);
  const c=await bus.post(env({evidence:['changed']}),G);
  assert.equal(c.code,'IDEMPOTENCY_CONFLICT'); assert.equal(writes.length,1);
});

test('lost append response: retry is safe and never double-writes once stored',async()=>{
  const w=fakeWorldline({failAppend:true});
  const r=await w.bus.post(env(),G); assert.equal(r.code,'BUS_WRITE_FAILED'); assert.equal(r.retrySafe,true);
  assert.equal(r.storageId,storageIdFor('ev-1'));
});

test('retry finds a stored event the snapshot window does not show',async()=>{
  const {bus,writes}=fakeWorldline({snapshotOmitsBus:true});
  const a=await bus.post(env(),G); assert.equal(a.code,'STORED_READBACK_EXACT');
  const b=await bus.post(env(),G); assert.equal(b.code,'DUPLICATE'); assert.equal(b.storageId,a.storageId);
  assert.equal(writes.length,1);
});

test('parent version is per goal; independent goals do not block (BUS-REVIEW-07)',async()=>{
  const {bus}=fakeWorldline();
  const a=await bus.post(env(),G);
  const other=await bus.post(env({eventId:'ev-x',goalId:'OTHER_GOAL'}),G); assert.equal(other.code,'STORED_READBACK_EXACT');
  const stale=await bus.post(env({eventId:'ev-2'}),G); assert.equal(stale.code,'STALE_PARENT'); assert.equal(stale.expected,a.storageId);
  assert.equal((await bus.post(env({eventId:'ev-2',parentVersion:a.storageId}),G)).code,'STORED_READBACK_EXACT');
});

test('projection keeps forks UNRESOLVED and is independent of other goals order',()=>{
  const rec=(id,goal,parent,at='2026-10-15T00:00:00Z')=>({storageId:id,at,envelope:{goalId:goal,parentVersion:parent,status:'CANDIDATE',proposal:{}},transport:{principal:'p'}});
  const p=project([rec('a','G1',GENESIS,'t1'),rec('b','G1','a','t2'),rec('c','G1','a','t3')]);
  assert.equal(p.goals.G1.conflicts.length,1); assert.equal(p.goals.G1.conflicts[0].status,'UNRESOLVED');
  assert.equal(p.goals.G1.head,null);
  // Newest-first input must still tip to the chain end, not the oldest event.
  const chain=project([rec('c','G1','b','t3'),rec('b','G1','a','t2'),rec('a','G1',GENESIS,'t1')]);
  assert.equal(chain.goals.G1.head,'c');
  const x=project([rec('a','G1',GENESIS),rec('z','G2',GENESIS),rec('b','G1','a')]);
  const y=project([rec('z','G2',GENESIS),rec('a','G1',GENESIS),rec('b','G1','a')]);
  assert.deepEqual(x.goals,y.goals);
});

test('truncated snapshot window refuses genesis when goal is invisible (R16)',async()=>{
  const {bus,writes}=fakeWorldline({extraEvents:100});
  assert.equal((await bus.post(env(),G)).code,'PARTIAL_SNAPSHOT'); assert.equal(writes.length,0);
});

test('unrelated traffic does not brick an already-visible goal head',async()=>{
  const w=fakeWorldline({extraEvents:0});
  const a=await w.bus.post(env(),G); assert.equal(a.code,'STORED_READBACK_EXACT');
  // Fill the snapshot window with non-bus events after the bus tip exists.
  for(let i=0;i<100;i++) w.events.push({predicate:'other',eventId:'Y'+i,timestampIso:'2026-10-15T01:00:00Z'});
  // Default limit 100 → truncated, but goal tip is still in the chronological decode set
  // only if bus events remain inside the window. Force newest-first window that keeps the tip:
  const prevFetch=w.bus.fetchImpl;
  w.bus.fetchImpl=async(url,opts={})=>{
    const u=new URL(url);
    if(u.pathname==='/worldline/v4/snapshot'){
      const limit=Number(u.searchParams.get('limit'));
      const ordered=[...w.events].reverse(); // newest-first
      return {ok:true,status:200,json:async()=>({schema:'mondayid.worldline.snapshot.v0.4.0',trust:'AUTHENTICATED_MACHINE_WRITER',readOnly:true,events:ordered.slice(0,limit)})};
    }
    return prevFetch(url,opts);
  };
  // With newest-first + 100 non-bus newest events, bus tip falls out → PARTIAL_SNAPSHOT.
  assert.equal((await w.bus.post(env({eventId:'ev-2',parentVersion:a.storageId}),G)).code,'PARTIAL_SNAPSHOT');
  // Larger window recovers the tip and allows the child.
  w.bus.snapshotLimit=200;
  assert.equal((await w.bus.post(env({eventId:'ev-2',parentVersion:a.storageId}),G)).code,'STORED_READBACK_EXACT');
});

test('unresolved fork blocks further descendants',async()=>{
  const w=fakeWorldline();
  const first=await w.bus.post(env(),G);
  const child=await w.bus.post(env({eventId:'ev-b',parentVersion:first.storageId}),G);
  assert.equal(child.code,'STORED_READBACK_EXACT');
  // Inject a sibling of `child` (same parent) without going through post().
  const forkEnv=env({eventId:'ev-fork',parentVersion:first.storageId,evidence:['fork']});
  w.events.push({
    eventId:storageIdFor('ev-fork'),
    timestampIso:'2026-10-15T00:00:01Z',
    subject:'MONDAY_UNIFIED_BUS',
    predicate:'mondayid_bus_envelope_v2',
    valueJson:JSON.stringify({
      schema:'mondayid.bus.record.v2',
      envelope:forkEnv,
      payloadHash:'x'.repeat(64),
      transport:{principal:'grok-monday',hostBound:true,claimedSourceHost:'grok-monday',receivedAt:'2026-10-15T00:00:01Z'},
      delivery:'STORED',
      policy:{executable:false,executor:'NONE',operationClass:'NO_OPERATION',riskFlags:[],advisoryRiskWords:false}
    }),
    epistemicStatus:'CANDIDATE'
  });
  const blocked=await w.bus.post(env({eventId:'ev-c',parentVersion:child.storageId}),G);
  assert.equal(blocked.code,'GOAL_UNRESOLVED_FORK');
});

test('readback mismatch is not success',async()=>{
  const {bus}=fakeWorldline({tamper:true});
  const r=await bus.post(env(),G); assert.equal(r.ok,false); assert.equal(r.code,'READBACK_MISMATCH');
});

test('policy: inert, typed, unknown = deny; keywords only advisory (BUS-REVIEW-02)',()=>{
  assert.equal(classifyPolicy(env()).operationClass,'NO_OPERATION');
  assert.equal(classifyPolicy(env({proposal:{operation:{kind:'drive_doc_create',reversible:true,costUsd:0}}})).operationClass,'FREE_REVERSIBLE_CANDIDATE');
  assert.equal(classifyPolicy(env({proposal:{operation:{kind:'launch_rocket',reversible:true}}})).operationClass,'UNKNOWN_DENY');
  assert.equal(classifyPolicy(env({proposal:{operation:{kind:'note'}}})).operationClass,'OWNER_GATE');
  for(const p of [{moneyMovement:true},{costIls:5},{steps:[{deletion:true}]},{operation:{kind:'note',reversible:true,publicFacing:true}}])
    assert.equal(classifyPolicy(env({proposal:p})).operationClass,'OWNER_GATE',JSON.stringify(p));
  const quoted=classifyPolicy(env({proposal:{text:'не delete ничего'}}));
  assert.equal(quoted.operationClass,'NO_OPERATION'); assert.equal(quoted.advisoryRiskWords,true);
  const quotedEvidence=classifyPolicy(env({evidence:['do not delete'],proposal:{operation:{kind:'note',reversible:true,costUsd:0}}}));
  assert.equal(quotedEvidence.operationClass,'FREE_REVERSIBLE_CANDIDATE'); assert.equal(quotedEvidence.advisoryRiskWords,true);
  assert.equal(classifyPolicy(env({proposal:{operation:{kind:'note',reversible:true}}})).operationClass,'OWNER_GATE');
  assert.equal(classifyPolicy(env({proposal:{operation:{kind:'note',reversible:true,costUsd:0}},evidence:[{deletion:true}]})).operationClass,'OWNER_GATE');
  assert.equal(classifyPolicy(env({observation:{moneyMovement:true},proposal:{operation:{kind:'note',reversible:true,costUsd:0}}})).operationClass,'OWNER_GATE');
  let deep={deletion:true}; for(let i=0;i<10;i++) deep={wrap:deep};
  assert.equal(classifyPolicy(env({proposal:deep})).operationClass,'OWNER_GATE');
  for(const p of [{},{operation:{kind:'note',reversible:true}}]) assert.equal(classifyPolicy(env({proposal:p})).executable,false);
});

test('sourceHost must match a host-bound principal; shared token is recorded as not host-bound (BUS-REVIEW-04)',async()=>{
  const {bus}=fakeWorldline();
  assert.equal((await bus.post(env({sourceHost:'chatgpt-monday'}),G)).code,'SOURCE_HOST_MISMATCH');
  assert.equal((await bus.post(env(),null)).code,'UNAVAILABLE_AUTH');
  const r=await bus.post(env(),{principal:'shared',hostBound:false});
  assert.equal(r.code,'HOST_BOUND_AUTH_REQUIRED');
});

test('ACK is a new event bound to target hash; it does not approve or alter the original',async()=>{
  const {bus}=fakeWorldline(); const a=await bus.post(env(),G);
  const k=await bus.ack({referenceStorageId:a.storageId,ackScope:'READ',eventId:'ack-1',sourceHost:'chatgpt-monday',parentVersion:a.storageId,evidence:['read']},C);
  assert.equal(k.code,'STORED_READBACK_EXACT');
  const l=await bus.list({goalId:'MONDAY_UNIFIED_BUS'});
  assert.equal(l.records.length,2);
  assert.equal(l.records[1].envelope.proposal.referencePayloadHash,a.payloadHash);
  assert.deepEqual(l.projection.acks[a.storageId],[{by:'chatgpt-monday',scope:'READ',storageId:k.storageId}]);
  assert.equal(l.records[0].policy.executable,false); assert.deepEqual(l.records[0].envelope,env());
  const forged=await bus.ack({referenceStorageId:a.storageId,eventId:'ack-2',sourceHost:'chatgpt-monday',parentVersion:k.storageId,evidence:[]},G);
  assert.equal(forged.code,'SOURCE_HOST_MISMATCH');
  assert.equal((await bus.ack({referenceStorageId:'E-BUS2-nope',eventId:'a3',sourceHost:'chatgpt-monday',parentVersion:'x',evidence:[]},C)).code,'ACK_TARGET_NOT_FOUND');
});

test('list: recipient filter and cursor pagination',async()=>{
  const {bus}=fakeWorldline(); const a=await bus.post(env(),G);
  await bus.post(env({eventId:'ev-2',parentVersion:a.storageId,nextAction:{recipient:'grok-monday',action:'resume'}}),G);
  assert.equal((await bus.list({recipient:'chatgpt-monday'})).records.length,1);
  const p1=await bus.list({limit:1}); assert.equal(p1.hasMore,true);
  const p2=await bus.list({afterStorageId:p1.nextCursor}); assert.equal(p2.records[0].envelope.eventId,'ev-2');
  assert.equal((await bus.list({afterStorageId:'bogus'})).code,'UNKNOWN_CURSOR');
});

test('MCP bus tools deny without credentials before any Worldline fetch',async()=>{
  const prev={t:process.env.MONDAYID_HOST_TOKEN,u:process.env.MONDAYID_WORLDLINE_URL,f:globalThis.fetch};
  process.env.MONDAYID_HOST_TOKEN='T'; process.env.MONDAYID_WORLDLINE_URL='https://wl.test';
  let fetched=0; globalThis.fetch=async()=>{fetched++; throw new Error('no');};
  for(const name of ['bus_post','bus_list','bus_get','bus_ack','bus_typo']){
    for(const headers of [{},{authorization:'Bearer wrong'}]){
      const res={setHeader(){},status(c){this.c=c;return this;},json(v){this.b=v;return this;},end(){return this;}};
      await mcpHandler({method:'POST',headers,body:{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:{}}}},res);
      assert.equal(res.b.error.message,'PRIVATE_TOOL_AUTH_REQUIRED',name);
    }
  }
  assert.equal(fetched,0);
  globalThis.fetch=prev.f;
  if(prev.t===undefined) delete process.env.MONDAYID_HOST_TOKEN; else process.env.MONDAYID_HOST_TOKEN=prev.t;
  if(prev.u===undefined) delete process.env.MONDAYID_WORLDLINE_URL; else process.env.MONDAYID_WORLDLINE_URL=prev.u;
});

test('Worldline point-read 404 denotes absent candidate, not an unverified success',async()=>{
  const w=fakeWorldline(); const prior=w.bus.fetchImpl;
  w.bus.fetchImpl=async(url,opts)=>{
    const u=new URL(url);
    if(u.pathname==='/worldline/v4/event' && !w.events.some(e=>e.eventId===u.searchParams.get('eventId')))
      return {ok:false,status:404,json:async()=>({code:'NOT_FOUND'})};
    return prior(url,opts);
  };
  assert.equal((await w.bus.post(env(),G)).code,'STORED_READBACK_EXACT');
});
