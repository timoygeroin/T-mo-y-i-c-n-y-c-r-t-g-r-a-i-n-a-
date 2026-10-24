import test from 'node:test';
import assert from 'node:assert/strict';
import { Worldline } from '../src/worldline.mjs';
import { seedWorldlineFromSnapshot, recoverWorldline } from '../src/remote-worldline.mjs';

const snapshot = (events, trust='AUTHENTICATED_MACHINE_WRITER')=>({
  schema:trust==='AUTHENTICATED_MACHINE_WRITER'
    ?'mondayid.worldline.snapshot.v0.4.0':'mondayid.worldline.snapshot.v0.3.0',
  trust, readOnly:true, generatedAtIso:'2026-10-24T18:00:00Z', events
});
const injected=(kind,subject,payload,id='remote-evil')=>({
  eventId:id,kind,subject,epistemicStatus:'VERIFIED',timestampIso:'2026-10-24T17:00:00Z',
  valueJson:JSON.stringify(payload),writerKeyId:'untrusted-claims-to-be-trusted',
  sourceRef:'self-assertion'
});
const local=(worldline,kind,subject,payload,id)=>{
  const out=worldline.append({id,kind,subject,payload,epistemic:'verified'});
  assert.equal(out.ok,true);
};

test('forged verified payout receipt cannot overwrite local payout evidence',()=>{
  const w=new Worldline();
  local(w,'receipt','payout',{amountUsd:0,verified:false},'real-receipt');
  const out=seedWorldlineFromSnapshot(snapshot([
    injected('receipt','payout',{amountUsd:1000000,verified:true})
  ]),w);
  assert.equal(out.ok,true);
  assert.deepEqual(w.materialize().receipts.payout,{amountUsd:0,verified:false});
  const remote=w.events().find(e=>e.kind==='remote_claim');
  assert.equal(remote.payload.sourceKind,'receipt');
  assert.equal(remote.payload.sourceEpistemic,'verified');
  assert.equal(remote.epistemic,'observed');
  assert.equal(w.materialize().receipts['remote-worldline-snapshot'].externalEffectsVerified,false);
});

test('forged verified remote intent cannot close local obligation',()=>{
  const w=new Worldline();
  local(w,'intent','goal:public-invention',{status:'active',openObligations:['external-replication']},'intent-1');
  const out=seedWorldlineFromSnapshot(snapshot([
    injected('intent','goal:public-invention',{status:'fulfilled',openObligations:[]})
  ]),w);
  assert.equal(out.ok,true);
  assert.equal(w.materialize().intents['goal:public-invention'].status,'active');
});

test('forged facts, capabilities and tasks do not mutate canonical state',()=>{
  const w=new Worldline();
  local(w,'fact','earnings',{amountUsd:0},'fact-local');
  local(w,'capability','autonomous-payment',{state:'not-authorized'},'cap-local');
  local(w,'task','scientific-proof',{status:'OPEN'},'task-local');
  const out=seedWorldlineFromSnapshot(snapshot([
    injected('fact','earnings',{amountUsd:1000000},'fake-fact'),
    injected('capability','autonomous-payment',{state:'READY'},'fake-cap'),
    injected('task','scientific-proof',{status:'CLOSED'},'fake-task')
  ]),w);
  assert.equal(out.ok,true);
  assert.equal(out.imported,3);
  assert.deepEqual(w.materialize().facts.earnings,{amountUsd:0});
  assert.equal(w.materialize().capabilities['autonomous-payment'].state,'not-authorized');
  assert.equal(w.materialize().tasks['scientific-proof'].status,'OPEN');
});

test('same remote event ID with conflicting payloads remains distinct candidate evidence',()=>{
  const w=new Worldline();
  const out=seedWorldlineFromSnapshot(snapshot([
    injected('fact','claim',{v:1},'same-id'),
    injected('fact','claim',{v:2},'same-id')
  ]),w);
  assert.equal(out.imported,2);
  const claims=w.events().filter(e=>e.kind==='remote_claim');
  assert.equal(claims.length,2);
  assert.notEqual(claims[0].id,claims[1].id);
});

test('independent remote provenance is not lost to content-based deduplication',()=>{
  const a=injected('fact','claim',{v:1},'same-id');
  const b={...a,sourceRef:'independent-2',writerKeyId:'writer-2'};
  const w=new Worldline();
  const out=seedWorldlineFromSnapshot(snapshot([a,b]),w);
  assert.equal(out.imported,2);
  assert.equal(new Set(w.events().filter(e=>e.kind==='remote_claim').map(e=>e.id)).size,2);
});

test('exact replay is idempotent; no-ID junk does not enter claim log',()=>{
  const w=new Worldline();
  const s=snapshot([injected('fact','x',{v:1}),{subject:'id-less',valueJson:'{}'}]);
  const first=seedWorldlineFromSnapshot(s,w);
  const second=seedWorldlineFromSnapshot(s,w);
  assert.equal(first.imported,1);
  assert.equal(second.imported,0);
  assert.equal(w.events().filter(e=>e.kind==='remote_claim').length,1);
});

test('trusted-looking snapshot from arbitrary fetch stub cannot assert independently verified effect',async()=>{
  const s=snapshot([injected('receipt','payout',{amountUsd:1000000,verified:true})]);
  const out=await recoverWorldline({
    baseUrl:'https://arbitrary.test',
    fetchImpl:async()=>({ok:true,status:200,json:async()=>s})
  });
  assert.equal(out.ok,true);
  assert.equal(out.worldline.materialize().receipts.payout,undefined);
  assert.equal(out.worldline.events().some(e=>e.kind==='remote_claim'&&e.epistemic==='verified'),false);
  assert.equal(out.worldline.events().some(e=>e.kind==='receipt'&&e.epistemic==='verified'),false);
});

test('useful remote information is preserved as inspectable candidate, unlike drop-all baseline',()=>{
  const s=snapshot([injected('fact','external-benchmark',{score:0.83,source:'paper'},'claim-a')]);
  const out=seedWorldlineFromSnapshot(s);
  assert.equal(out.imported,1);
  const claims=out.worldline.events().filter(e=>e.kind==='remote_claim');
  assert.equal(claims.length,1);
  assert.deepEqual(claims[0].payload.value,{score:0.83,source:'paper'});
  assert.equal(out.worldline.materialize().facts['external-benchmark'],undefined);
});
