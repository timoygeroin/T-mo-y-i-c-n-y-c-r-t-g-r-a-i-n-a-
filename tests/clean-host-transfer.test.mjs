import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverCapabilities } from '../src/capability-discovery.mjs';
import { proveCleanHostTransfer } from '../src/transfer-harness.mjs';

test('capabilities are rediscovered from the current host instead of inherited blindly',async()=>{
  const good={name:'good',execute:async()=>({ok:true}),verify:async()=>({ok:true})};
  const visible={name:'visible'};
  const out=await discoverCapabilities([
    {id:'good',domain:'general',receptor:good},
    {id:'visible',domain:'vision',receptor:visible},
    {id:'blocked',domain:'host',receptor:good,probe:async()=>({state:'BLOCKED',evidence:['login required']})}
  ]);
  assert.equal(out.manifest.find(x=>x.id==='good').state,'AVAILABLE');
  assert.equal(out.manifest.find(x=>x.id==='visible').state,'VISIBLE_ONLY');
  assert.equal(out.manifest.find(x=>x.id==='blocked').state,'BLOCKED');
  assert.equal(out.capabilities.general,good);
  assert.equal('vision' in out.capabilities,false);
  assert.equal('host' in out.capabilities,false);
});

test('clean-host transfer performs external write/readback and the next fresh host recovers the evidence',async()=>{
  const events=[];
  const snapshot=()=>({
    schema:'mondayid.worldline.snapshot.v0.4.0',
    trust:'AUTHENTICATED_MACHINE_WRITER',
    readOnly:true,
    generatedAtIso:new Date().toISOString(),
    events:[...events],
    conflictProbe:{conflicts:[]}
  });

  const fetchImpl=async(url,init={})=>{
    const u=new URL(url);
    if(u.pathname==='/worldline/v4/snapshot'){
      return {ok:true,status:200,json:async()=>snapshot()};
    }
    if(u.pathname==='/worldline/v4/append'){
      const event=JSON.parse(init.body);
      events.unshift({...event,writerKeyId:'test-writer'});
      return {
        ok:true,
        status:201,
        json:async()=>({
          ok:true,
          schema:'mondayid.worldline.write-receipt.v0.4.0',
          status:'INSERTED',
          event:{...event,writerKeyId:'test-writer'}
        })
      };
    }
    if(u.pathname==='/worldline/v4/event'){
      const eventId=u.searchParams.get('eventId');
      const event=events.find(item=>item.eventId===eventId);
      return {
        ok:Boolean(event),
        status:event ? 200 : 404,
        json:async()=>event
          ? {schema:'mondayid.worldline.event.v0.4.0',event,conflicts:[]}
          : {schema:'mondayid.worldline.event.v0.4.0',event:null,conflicts:[]}
      };
    }
    return {ok:false,status:404,json:async()=>({})};
  };

  const out=await proveCleanHostTransfer({
    baseUrl:'https://worldline.test',
    token:'token',
    fetchImpl,
    signalId:'transfer-canary'
  });
  assert.equal(out.ok,true);
  assert.equal(out.state,'VERIFIED');
  assert.equal(out.code,'CLEAN_HOST_TRANSFER_PASS');
  assert.equal(out.proof.firstHost.verification.mode,'external-exact-readback');
  assert.equal(out.proof.nextHost.inheritedEffect,true);
});

test('clean-host transfer fails closed at the human credential gate without a writer token',async()=>{
  const out=await proveCleanHostTransfer({baseUrl:'https://worldline.test',token:null});
  assert.equal(out.ok,false);
  assert.equal(out.state,'HUMAN_GATE');
  assert.equal(out.code,'WORLDLINE_WRITER_TOKEN_REQUIRED');
});
