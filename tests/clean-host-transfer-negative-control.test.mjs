import test from 'node:test';
import assert from 'node:assert/strict';
import { proveCleanHostTransfer } from '../src/transfer-harness.mjs';

function fakeProvider({dropSecondReadback=false,tamperSecondSnapshot=false}={}){
  const events=[];
  let eventReads=0, snapshotReads=0;
  return async (url,init={})=>{
    const u=new URL(url);
    if(u.pathname==='/worldline/v4/snapshot'){
      snapshotReads++;
      const items=events.map(e=>({...e}));
      if(tamperSecondSnapshot && snapshotReads>=2 && items[0]){
        items[0].valueJson=JSON.stringify({sourceSignal:'forged',effect:'pretend'});
      }
      return {ok:true,status:200,json:async()=>({
        schema:'mondayid.worldline.snapshot.v0.4.0',
        trust:'AUTHENTICATED_MACHINE_WRITER',readOnly:true,
        generatedAtIso:'2026-10-24T18:00:00Z',events:items,conflictProbe:{conflicts:[]}
      })};
    }
    if(u.pathname==='/worldline/v4/append'){
      const e=JSON.parse(init.body);
      events.unshift({...e,writerKeyId:'provider-writer'});
      return {ok:true,status:201,json:async()=>({ok:true,status:'INSERTED'})};
    }
    if(u.pathname==='/worldline/v4/event'){
      eventReads++;
      if(dropSecondReadback && eventReads>=2)
        return {ok:false,status:404,json:async()=>({event:null})};
      const e=events.find(x=>x.eventId===u.searchParams.get('eventId'));
      return {ok:Boolean(e),status:e?200:404,json:async()=>({
        schema:'mondayid.worldline.event.v0.4.0',event:e||null,conflicts:[]
      })};
    }
    return {ok:false,status:404,json:async()=>({})};
  };
}

test('fresh-host transfer refuses snapshot-only success when second exact readback fails',async()=>{
  const out=await proveCleanHostTransfer({
    baseUrl:'https://worldline.test',token:'test-token',signalId:'negative-readback',
    fetchImpl:fakeProvider({dropSecondReadback:true})
  });
  assert.equal(out.ok,false);
  assert.equal(out.code,'NEXT_CELL_EVIDENCE_MISSING');
  assert.ok(out.proof.nextHost.inherited); // the snapshot claimed persistence
  assert.equal(out.proof.nextHost.exactReadback.ok,false);
  assert.equal(out.proof.nextHost.independentlyVerifiedRealWorldOutcome,false);
});

test('fresh-host transfer refuses a tampered second snapshot even when original write was real',async()=>{
  const out=await proveCleanHostTransfer({
    baseUrl:'https://worldline.test',token:'test-token',signalId:'negative-snapshot',
    fetchImpl:fakeProvider({tamperSecondSnapshot:true})
  });
  assert.equal(out.ok,false);
  assert.equal(out.code,'NEXT_CELL_EVIDENCE_MISSING');
  assert.equal(out.proof.nextHost.inherited,null);
});
