import test from 'node:test';
import assert from 'node:assert/strict';
import { SharedBus, GENESIS, validateEnvelope, classifyAuthority, BUS_PREDICATE } from '../src/shared-bus.mjs';
import mcpHandler from '../api/mcp.mjs';

function fakeWorldline({ tamper=false } = {}) {
  const events=[]; const writes=[];
  const fetchImpl=async(url,opts={})=>{
    const u=new URL(url);
    const j=(b,ok=true,status=200)=>({ok,status,json:async()=>b});
    if(u.pathname==='/worldline/v4/append'){
      if(opts.headers?.authorization!=='Bearer W') return j({ok:false},false,401);
      const e=JSON.parse(opts.body); writes.push(e);
      events.push(tamper?{...e,valueJson:e.valueJson+' '}:e); return j({ok:true,status:'APPENDED'});
    }
    if(u.pathname==='/worldline/v4/snapshot') return j({schema:'mondayid.worldline.snapshot.v0.4.0',readOnly:true,trust:'AUTHENTICATED_MACHINE_WRITER',events:[{predicate:'other',eventId:'X'},...events]});
    if(u.pathname==='/worldline/v4/event') return j({event:events.find(e=>e.eventId===u.searchParams.get('eventId'))??null,conflicts:[]});
    return j({},false,404);
  };
  return { events, writes, bus:new SharedBus({baseUrl:'https://wl.test',writerToken:'W',fetchImpl,now:()=> '2026-10-15T00:00:00Z'}) };
}
const env=(o={})=>({eventId:'ev-1',sourceHost:'grok-monday',parentVersion:GENESIS,goalId:'MONDAY_UNIFIED_BUS',observation:'o',evidence:['e'],proposal:{text:'review architecture'},nextAction:'critique',status:'CANDIDATE',...o});

test('envelope requires exactly the 9 fields',()=>{
  assert.equal(validateEnvelope(env()).ok,true);
  const {proposal,...missing}=env(); assert.equal(validateEnvelope(missing).code,'ENVELOPE_MISSING_FIELD');
  assert.equal(validateEnvelope({...env(),secret:1}).code,'ENVELOPE_UNKNOWN_FIELDS');
  assert.equal(validateEnvelope(env({status:'DONE'})).code,'ENVELOPE_BAD_STATUS');
});

test('post writes, reads back exactly, advances head; list skips non-bus events',async()=>{
  const {bus}=fakeWorldline();
  const r=await bus.post(env()); assert.equal(r.code,'VERIFIED'); assert.equal(r.ok,true);
  const l=await bus.list(); assert.equal(l.events.length,1); assert.equal(l.head,r.storageId);
  assert.equal(l.events[0].envelope.goalId,'MONDAY_UNIFIED_BUS');
});

test('idempotent: same envelope twice is DUPLICATE, single write',async()=>{
  const {bus,writes}=fakeWorldline();
  const a=await bus.post(env()); const b=await bus.post(env());
  assert.equal(b.code,'DUPLICATE'); assert.equal(b.storageId,a.storageId); assert.equal(writes.length,1);
  const c=await bus.post(env({observation:'changed',parentVersion:a.storageId})); assert.equal(c.code,'EVENT_ID_REUSED'); assert.equal(c.ok,false);
});

test('parent-version check rejects stale parent',async()=>{
  const {bus,writes}=fakeWorldline();
  const a=await bus.post(env());
  const s=await bus.post(env({eventId:'ev-2'})); assert.equal(s.code,'STALE_PARENT'); assert.equal(s.expected,a.storageId);
  const ok=await bus.post(env({eventId:'ev-2',parentVersion:a.storageId})); assert.equal(ok.code,'VERIFIED'); assert.equal(writes.length,2);
});

test('readback mismatch is not reported as success',async()=>{
  const {bus}=fakeWorldline({tamper:true});
  const r=await bus.post(env()); assert.equal(r.ok,false); assert.equal(r.code,'READBACK_MISMATCH');
});

test('authority fails closed: consequential proposals are stored GATED',async()=>{
  for(const p of [{moneyMovement:true},{costIls:5},{steps:[{deletion:true}]},'send an email to Andrey','delete branch main','оплатить подписку','enter password',{publicFacing:true}]){
    assert.equal(classifyAuthority(env({proposal:p})).status,'GATED',JSON.stringify(p));
  }
  assert.equal(classifyAuthority(env({nextAction:'accept the terms'})).status,'GATED');
  assert.equal(classifyAuthority(env({status:'ACK'})).status,'ACK');
  const {bus}=fakeWorldline(); const r=await bus.post(env({proposal:{spending:true}}));
  assert.equal(r.status,'GATED'); assert.equal((await bus.list()).events[0].envelope.status,'GATED');
});

test('no writer token or bad token fails closed',async()=>{
  const {bus}=fakeWorldline(); bus.writerToken=undefined; assert.equal((await bus.post(env())).code,'NO_WORLDLINE_WRITER_TOKEN');
  bus.writerToken='bad'; assert.equal((await bus.post(env())).code,'BUS_WRITE_REJECTED');
});

test('ack appends a new envelope pointing at target',async()=>{
  const {bus}=fakeWorldline(); const a=await bus.post(env());
  const k=await bus.ack({targetEventId:a.storageId,eventId:'ack-1',sourceHost:'chatgpt-monday',parentVersion:a.storageId,evidence:'read doc'});
  assert.equal(k.code,'VERIFIED'); const l=await bus.list(); assert.equal(l.events.length,2); assert.equal(l.events[1].envelope.status,'ACK');
  assert.equal(l.events[1].envelope.proposal.target,a.storageId);
});

test('MCP bus tools are private without bearer',async()=>{
  const prev=process.env.MONDAYID_HOST_TOKEN; process.env.MONDAYID_HOST_TOKEN='T';
  for(const name of ['bus_post','bus_list','bus_get','bus_ack']){
    const res={setHeader(){},status(c){this.c=c;return this;},json(v){this.b=v;return this;},end(){return this;}};
    await mcpHandler({method:'POST',headers:{},body:{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:{}}}},res);
    assert.equal(res.b.error.message,'PRIVATE_TOOL_AUTH_REQUIRED',name);
  }
  if(prev===undefined) delete process.env.MONDAYID_HOST_TOKEN; else process.env.MONDAYID_HOST_TOKEN=prev;
});
