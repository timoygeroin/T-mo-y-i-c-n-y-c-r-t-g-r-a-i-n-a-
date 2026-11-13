import test from 'node:test';
import assert from 'node:assert/strict';
import { AutoDotRelay, autoDotOnFinish } from '../src/auto-dot.mjs';

test('automatically continues immediately after host turn completes, without user dot', async () => {
  const seen=[];
  const relay=new AutoDotRelay({
    execute:async ({hop})=>{seen.push(hop);return hop===1
      ? {ok:true,state:'PROGRESSED',nextCursor:'cursor-2',evidence:'verified-first'}
      : {ok:true,state:'FULFILLED',evidence:'verified-last'};},
    record:async receipt=>seen.push(receipt.state)
  });
  const host=autoDotOnFinish(async ()=>({id:'turn-1',pending:true}),relay,turn=>({
    eventId:turn.id,taskId:'task',openWork:turn.pending
  }));
  const out=await host();
  assert.equal(out.continuation.state,'FULFILLED');
  assert.deepEqual(seen,[1,'PROGRESSED',2,'FULFILLED']);
});

test('no action when finished or awaiting owner approval', async () => {
  let calls=0;
  const relay=new AutoDotRelay({execute:async()=>{calls++; return {ok:true,state:'FULFILLED'};}});
  assert.equal((await relay.onTurnComplete({eventId:'1',taskId:'a'})).state,'IDLE');
  assert.equal((await relay.onTurnComplete({eventId:'2',taskId:'a',openWork:true,ownerApprovalRequired:true})).state,'OWNER_APPROVAL_REQUIRED');
  assert.equal(calls,0);
});

test('event idempotence prevents repeated execution',async()=>{
  let calls=0;
  const relay=new AutoDotRelay({execute:async()=>{calls++;return {ok:true,state:'FULFILLED'};}});
  const event={eventId:'same',taskId:'a',openWork:true};
  assert.equal((await relay.onTurnComplete(event)).state,'FULFILLED');
  assert.equal((await relay.onTurnComplete(event)).state,'DUPLICATE');
  assert.equal(calls,1);
});

test('fails closed on missing verification or unchanged continuation cursor',async()=>{
  let calls=0;
  const relay=new AutoDotRelay({execute:async()=>{calls++;return {ok:true,state:'PROGRESSED',nextCursor:'same',evidence:'receipt'};}});
  const out=await relay.onTurnComplete({eventId:'e',taskId:'a',openWork:true,cursor:'same'});
  assert.equal(out.reason,'NO_VERIFIED_FORWARD_PROGRESS');
  assert.equal(calls,1);
});

test('execution is bounded and safely yields cursor for next external event',async()=>{
  const relay=new AutoDotRelay({maxHops:2,execute:async ({hop})=>({ok:true,state:'PROGRESSED',nextCursor:String(hop),evidence:'verified'})});
  const out=await relay.onTurnComplete({eventId:'e',taskId:'a',openWork:true});
  assert.equal(out.state,'YIELDED');
  assert.equal(out.hops,2);
  assert.equal(out.nextCursor,'2');
});

test('atomic durable claim can suppress duplicate across workers',async()=>{
  const claims=new Set();
  const claim=async id=>claims.has(id)?false:(claims.add(id),true);
  let calls=0;
  const one=new AutoDotRelay({claim,execute:async()=>{calls++;return {ok:true,state:'FULFILLED'};}});
  const two=new AutoDotRelay({claim,execute:async()=>{calls++;return {ok:true,state:'FULFILLED'};}});
  const event={eventId:'same',taskId:'a',openWork:true};
  await one.onTurnComplete(event);
  assert.equal((await two.onTurnComplete(event)).state,'DUPLICATE');
  assert.equal(calls,1);
});
