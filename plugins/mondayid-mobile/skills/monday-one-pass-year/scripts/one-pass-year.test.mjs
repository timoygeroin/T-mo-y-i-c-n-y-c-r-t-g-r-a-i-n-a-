import test from 'node:test';
import assert from 'node:assert/strict';
import {compileKnownFrontier,compressKnownYear} from './one-pass-year.mjs';
const task=(id,opts={})=>({id,effectId:'effect:'+id,authorized:true,reversible:true,cost:0,resources:[],dependsOn:[],...opts});
const response={attemptId:'try:1',claimsCompleted:true,receipt:{verified:true}};
const probe=(t,attempt)=>({id:'receipt:'+t.id,taskId:t.id,effectId:t.effectId,objectId:t.objectId,
 attemptId:attempt.attemptId,verified:true,independent:true,observerClass:'trusted-host-receptor',noOpRejected:true,effectObserved:true});
const run=(tasks,rest={})=>compressKnownYear({tasks,execute:async()=>response,probe,...rest});

test('1 complete dependency chain in one invocation, each child follows verified parent',async()=>{
 let order=[];
 const x=await compressKnownYear({tasks:[task('A'),task('B',{dependsOn:['A']}),task('C',{dependsOn:['B']})],
   execute:async t=>{order.push(t.id);return response;},probe});
 assert.deepEqual(order,['A','B','C']);assert.equal(x.accepted.length,3);assert.equal(x.generations,3);
 assert.equal(x.claimScope,'KNOWN_CURRENT_FRONTIER_ONLY_NOT_FUTURE_YEAR_COMPLETED');
});
test('2 zero permission never executes an unapproved write',async()=>{
 const x=await run([task('A',{authorized:false})]);assert.equal(x.actions,0);assert.equal(x.unresolved.A,'AUTHORITY_OR_REVERSIBILITY_GATE');
});
test('3 irreversible action is blocked regardless of priority',async()=>{
 const x=await run([task('A',{reversible:false,currentOwnerPriority:true})]);assert.equal(x.actions,0);
});
test('4 positive cost cannot be hidden by optimistic route score',async()=>{
 const x=await run([task('A',{cost:0.01})]);assert.equal(x.actions,0);
});
test('5 human gate is explicit and never bypassed',async()=>{
 const x=await run([task('A',{humanGate:true})]);assert.deepEqual(x.human,['A']);
});
test('6 future task is not retrospectively marked done',async()=>{
 const x=await run([task('A',{notBefore:'2027-01-01T00:00:00Z'})]);assert.deepEqual(x.future,['A']);assert.equal(x.accepted.length,0);
});
test('7 missing dependency is not inferred as complete',()=>{
 const x=compileKnownFrontier([task('B',{dependsOn:['NEVER']})]);assert.equal(x.blocked.B,'MISSING_DEPENDENCY');
});
test('8 cycle is blocked, not silently traversed',()=>{
 const x=compileKnownFrontier([task('A',{dependsOn:['B']}),task('B',{dependsOn:['A']})]);
 assert.equal(x.blocked.A,'CYCLIC_DEPENDENCY');assert.equal(x.blocked.B,'CYCLIC_DEPENDENCY');
});
test('9 conflicting task ID fails closed',async()=>{
 const x=await run([task('A'),task('A',{effectId:'totally-different'})]);assert.equal(x.status,'INVALID_FRONTIER');
});
test('10 duplicate effect with same scope executes only once',async()=>{
 const x=await run([task('A',{effectId:'X'}),task('B',{effectId:'X'})]);assert.equal(x.accepted.length,1);assert.equal(x.frontierSummary.duplicates,1);
});
test('11 forged executor self receipt cannot pass without real probe',async()=>{
 const x=await compressKnownYear({tasks:[task('A')],execute:async()=>response,probe:async()=>null});
 assert.equal(x.accepted.length,0);assert.equal(x.unresolved.A,'INDEPENDENT_EFFECT_NOT_VERIFIED');
});
test('12 a mismatched task/effect receipt fails',async()=>{
 const x=await run([task('A')],{probe:async(t,a)=>({...probe(t,a),effectId:'wrong'})});assert.equal(x.accepted.length,0);
});
test('13 a no-op that passes verifier is rejected',async()=>{
 const x=await run([task('A')],{probe:async(t,a)=>({...probe(t,a),noOpRejected:false})});assert.equal(x.accepted.length,0);
});
test('14 matching receipt from wrong attempted action is rejected',async()=>{
 const x=await run([task('A')],{probe:async(t,a)=>({...probe(t,a),attemptId:'else'})});assert.equal(x.accepted.length,0);
});
test('15 missing independent trusted probe blocks the entire pass',async()=>{
 const x=await compressKnownYear({tasks:[task('A')],execute:async()=>response});assert.equal(x.status,'NO_TRUSTED_EXECUTOR_OR_PROBE');
});
test('16 successful effect without writer is not falsely called persistent learning',async()=>{
 const x=await run([task('A')]);assert.equal(x.accepted.length,1);assert.equal(x.accepted[0].durable,false);assert.equal(x.durableInheritanceConfirmed,false);
});
test('17 versioned write plus independent readback promotes only matching mutation',async()=>{
 const x=await run([task('A'),task('B',{dependsOn:['A']})],{
  expectedVersion:'10',
  persist:async({expectedVersion,record})=>({ok:true,version:String(Number(expectedVersion)+1)}),
  readPersisted:async({taskId,version})=>({taskId,effectId:'effect:'+taskId,objectId:'unspecified-object',receiptId:'receipt:'+taskId,version})
 });
 assert.equal(x.version,'12');assert.equal(x.durableInheritanceConfirmed,true);assert.ok(x.accepted.every(a=>a.durable));
});
test('18 stale or failed readback cannot become durable ancestry',async()=>{
 const x=await run([task('A')],{expectedVersion:'1',persist:async()=>({ok:true,version:'2'}),readPersisted:async()=>({taskId:'other'})});
 assert.equal(x.accepted[0].durable,false);assert.equal(x.durableInheritanceConfirmed,false);
});
test('19 rejected predecessor prevents dependent task from executing',async()=>{
 const seen=[];
 const x=await compressKnownYear({tasks:[task('A'),task('B',{dependsOn:['A']})],
   execute:async t=>{seen.push(t.id);return response;},probe:async()=>({verified:false})});
 assert.deepEqual(seen,['A']);assert.equal(x.remaining[0].taskId,'B');
});
test('20 resource conflict prevents parallel double write',async()=>{
 let running=0,peak=0;
 await compressKnownYear({tasks:[task('A',{resources:['shared']}),task('B',{resources:['shared']})],maxConcurrency:2,
   execute:async()=>{running++;peak=Math.max(peak,running);await Promise.resolve();running--;return response;},probe});
 assert.equal(peak,1);
});
test('21 disjoint work can execute concurrently in one generation',async()=>{
 const x=await run([task('A',{resources:['A']}),task('B',{resources:['B']})]);assert.equal(x.generations,1);assert.equal(x.accepted.length,2);
});
test('22 explicit budget stops without erasing remaining work',async()=>{
 const x=await run([task('A'),task('B'),task('C')],{maxActions:1});assert.equal(x.status,'PASS_BUDGET');assert.equal(x.remaining.length,2);
});
test('23 real user effect can terminate without pretending all future work finished',async()=>{
 const x=await run([task('A'),task('B',{dependsOn:['A']})],{targetEffectIds:['effect:A']});
 assert.equal(x.status,'TARGET_EFFECT_OBSERVED');assert.equal(x.remaining.length,1);
});
test('24 model result cannot claim inherited or completed without a receipt observer',async()=>{
 const x=await compressKnownYear({tasks:[task('A')],execute:async()=>({attemptId:'try:1',verified:true,receipt:{id:'bogus',effectObserved:true}}),
 probe:async()=>({verified:true,independent:true,observerClass:'model-self-report',noOpRejected:true})});
 assert.equal(x.accepted.length,0);
});

test('25 different routes for same effect survive deduplication; fallback executes after failed primary',async()=>{
 const x=await compressKnownYear({tasks:[task('A',{effectId:'same',objectId:'same-object',routeId:'primary'}),task('B',{effectId:'same',objectId:'same-object',routeId:'backup'})],
 execute:async t=>({attemptId:'attempt:'+t.id}),
 probe:async(t,a)=>t.id==='A'?{verified:false}:{...probe(t,a),id:'r-b'}});
 assert.equal(x.actions,2);assert.equal(x.accepted.length,1);assert.equal(x.accepted[0].taskId,'B');
 assert.equal(x.unresolved.A,undefined);assert.ok(x.events.some(e=>e.taskId==='A'&&e.status==='ALTERNATIVE_ROUTE_SKIPPED_AFTER_EFFECT'));
});
test('26 same-looking effect on different exact objects is never wrongly deduplicated',async()=>{
 const x=await run([task('A',{objectId:'alice',effectId:'same'}),task('B',{objectId:'bob',effectId:'same'})]);
 assert.equal(x.accepted.length,2);
});
test('27 alternative routes for same exact effect never run concurrently',async()=>{
 let running=0,peak=0;
 const x=await compressKnownYear({tasks:[task('A',{routeId:'left',effectId:'same',objectId:'same'}),task('B',{routeId:'right',effectId:'same',objectId:'same'})],maxConcurrency:2,
 execute:async()=>{running++;peak=Math.max(peak,running);await Promise.resolve();running--;return response;},probe});
 assert.equal(peak,1);assert.equal(x.actions,1);assert.equal(x.accepted.length,1);
});
test('28 observed goal takes precedence over budget exhaustion in a one-action pass',async()=>{
 const x=await run([task('A'),task('B')],{maxActions:1,targetEffectIds:['effect:A']});
 assert.equal(x.status,'TARGET_EFFECT_OBSERVED');
});
test('29 failed independent route does not halt unrelated safe tasks',async()=>{
 const x=await compressKnownYear({tasks:[task('A',{score:200}),task('B')],maxConcurrency:1,
 execute:async()=>response,probe:async(t,a)=>t.id==='A'?{verified:false}:probe(t,a)});
 assert.ok(x.accepted.some(y=>y.taskId==='B'));assert.equal(x.actions,2);
});

test('30 conflicting durable head halts dependent actions for explicit rebase',async()=>{
 const seen=[];
 const x=await compressKnownYear({tasks:[task('A'),task('B',{dependsOn:['A']})],
 execute:async t=>{seen.push(t.id);return response;},probe,
 expectedVersion:'4',persist:async()=>({ok:false,code:'HEAD_DRIFT'}),readPersisted:async()=>({})});
 assert.deepEqual(seen,['A']);assert.equal(x.status,'DURABLE_HEAD_RECONCILIATION_REQUIRED');
 assert.equal(x.accepted[0].durable,false);assert.equal(x.remaining[0].taskId,'B');
});
test('31 a future timestamp with timezone offset is compared as an instant, not text',()=>{
 const x=compileKnownFrontier([task('A',{notBefore:'2026-10-31T21:00:00+02:00'})],{asOf:'2026-10-31T20:00:00Z'});
 assert.equal(x.blocked.A,undefined);
});
test('32 a trusted readback failing after write never promotes and requires rebase',async()=>{
 const x=await run([task('A')],{expectedVersion:'5',persist:async()=>({ok:true,version:'6'}),readPersisted:async()=>({version:'5'})});
 assert.equal(x.status,'DURABLE_HEAD_RECONCILIATION_REQUIRED');assert.equal(x.durableInheritanceConfirmed,false);
});

test('33 verified old receipt plus fresh independent effect readback skips execution',async()=>{
 let calls=0;
 const x=await compressKnownYear({tasks:[task('A'),task('B',{dependsOn:['A']})],
 execute:async()=>{calls++;return response;},probe,
 recover:async t=>t.id==='A'?{receiptId:'r0',taskId:'A',effectId:'effect:A',objectId:'unspecified-object',verified:true,independent:true,observerClass:'trusted-host-receptor',noOpRejected:true,effectObserved:true}:null,
 recheck:async t=>({ok:true,effectObserved:true,taskId:t.id,effectId:t.effectId,objectId:t.objectId})});
 assert.equal(calls,1);assert.equal(x.reused.length,1);assert.equal(x.accepted.length,1);assert.equal(x.accepted[0].taskId,'B');
});
test('34 a prior receipt without fresh effect readback is not reused',async()=>{
 let calls=0;
 const x=await compressKnownYear({tasks:[task('A')],execute:async()=>{calls++;return response;},probe,
 recover:async t=>({receiptId:'r0',taskId:t.id,effectId:t.effectId,objectId:t.objectId,verified:true,independent:true,observerClass:'trusted-host-receptor',noOpRejected:true,effectObserved:true}),
 recheck:async()=>({ok:false})});
 assert.equal(calls,1);assert.equal(x.reused.length,0);
});
test('35 model-shaped stored self-report cannot masquerade as reused effect',async()=>{
 let calls=0;
 const x=await compressKnownYear({tasks:[task('A')],execute:async()=>{calls++;return response;},probe,
 recover:async t=>({receiptId:'r0',taskId:t.id,effectId:t.effectId,objectId:t.objectId,verified:true,independent:false,observerClass:'model-self-report',noOpRejected:true,effectObserved:true}),
 recheck:async()=>({ok:true})});
 assert.equal(calls,1);assert.equal(x.reused.length,0);
});
test('36 verified readback for wrong object cannot promote',async()=>{
 const x=await run([task('A',{objectId:'target:1'})],{probe:async(t,a)=>({...probe(t,a),objectId:'target:2'})});
 assert.equal(x.accepted.length,0);
});

test('37 recovered backup effect cancels stale primary route without rerunning it',async()=>{
 let calls=0;
 const list=[task('primary',{effectId:'X',objectId:'target',routeId:'primary'}),task('backup',{effectId:'X',objectId:'target',routeId:'backup'})];
 const x=await compressKnownYear({tasks:list,
  execute:async()=>{calls++;return response;},probe,
  recover:async t=>t.id==='backup'?{receiptId:'r:backup',taskId:t.id,effectId:t.effectId,objectId:t.objectId,verified:true,independent:true,observerClass:'trusted-host-receptor',noOpRejected:true,effectObserved:true}:null,
  recheck:async t=>({ok:true,effectObserved:true,taskId:t.id,effectId:t.effectId,objectId:t.objectId})});
 assert.equal(calls,0);assert.equal(x.reused.length,1);assert.equal(x.remaining.length,0);
});
test('38 same ID different object cannot silently deduplicate authority',()=>{
 const x=compileKnownFrontier([task('A',{objectId:'u1'}),task('A',{objectId:'u2'})]);
 assert.ok(x.failures.some(f=>f.code==='CONFLICTING_TASK_ID'));
});
test('39 same ID with humanOnly gate cannot be collapsed into safe task',()=>{
 const x=compileKnownFrontier([task('A'),task('A',{humanGate:true})]);
 assert.ok(x.failures.some(f=>f.code==='CONFLICTING_TASK_ID'));
});
test('40 same ID with public disclosure cannot be collapsed into private route',()=>{
 const x=compileKnownFrontier([task('A'),task('A',{externalPublication:true})]);
 assert.ok(x.failures.some(f=>f.code==='CONFLICTING_TASK_ID'));
});
test('41 same-effect same-route but contradictory permissions is a conflict, not duplicate',()=>{
 const x=compileKnownFrontier([task('A',{effectId:'E',objectId:'o'}),task('B',{effectId:'E',objectId:'o',authorized:false})]);
 assert.ok(x.failures.some(f=>f.code==='CONFLICTING_EFFECT_AUTHORITY'));
 assert.equal(x.blocked.A,'CONFLICTING_EFFECT_AUTHORITY');
});
test('42 malformed dependency string is not silently normalized to []',()=>{
 const x=compileKnownFrontier([task('A',{dependsOn:'SAFE_DEP'})]);
 assert.ok(x.failures.some(f=>f.code==='INVALID_TASK_ARRAY'&&f.field==='dependsOn'));
});
test('43 malformed resource string is not silently normalized to []',()=>{
 const x=compileKnownFrontier([task('A',{resources:'bank-account'})]);
 assert.ok(x.failures.some(f=>f.code==='INVALID_TASK_ARRAY'&&f.field==='resources'));
});
test('44 nonstring dependency element is not silently discarded',()=>{
 const x=compileKnownFrontier([task('A',{dependsOn:['X',123]})]);
 assert.ok(x.failures.some(f=>f.code==='INVALID_TASK_ARRAY'&&f.field==='dependsOn'));
});
test('45 nonstring resource element is not silently discarded',()=>{
 const x=compileKnownFrontier([task('A',{resources:[false,'bank-account']})]);
 assert.ok(x.failures.some(f=>f.code==='INVALID_TASK_ARRAY'&&f.field==='resources'));
});
test('46 humanGate string is invalid rather than false',()=>{
 const x=compileKnownFrontier([task('A',{humanGate:'yes'})]);
 assert.ok(x.failures.some(f=>f.code==='INVALID_GATE_BOOLEAN'&&f.field==='humanGate'));
});
test('47 externalPublication string is invalid rather than false',()=>{
 const x=compileKnownFrontier([task('A',{externalPublication:'true'})]);
 assert.ok(x.failures.some(f=>f.code==='INVALID_GATE_BOOLEAN'&&f.field==='externalPublication'));
});
test('48 unchanged CAS version is not an accepted durable successor',async()=>{
 const x=await run([task('A')],{expectedVersion:'7',
 persist:async()=>({ok:true,version:'7'}),
 readPersisted:async()=>({taskId:'A',effectId:'effect:A',objectId:'unspecified-object',receiptId:'receipt:A',version:'7'})});
 assert.equal(x.durableInheritanceConfirmed,false);
 assert.equal(x.status,'DURABLE_HEAD_RECONCILIATION_REQUIRED');
});
