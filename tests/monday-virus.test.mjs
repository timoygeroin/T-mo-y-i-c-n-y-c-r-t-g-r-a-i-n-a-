import test from 'node:test';
import assert from 'node:assert/strict';
import {attachMondayVirus,infectAction,inheritVerifiedMutation} from '../src/monday-virus.mjs';
import {compileAttractorContract} from '../src/attractor-field.mjs';
import {createModelReceptor} from '../src/model-receptor.mjs';

const genome={
  sourceRef:'google-drive:MONDAYID_CANONICAL_CSTAR',
  snapshot:{
    id:'CSTAR:verified-cell',
    version:'42',
    identity:'ONE_MONDAYID',
    laws:['continuation_not_creation','do_real_work_before_status'],
    failureGenes:['REPORT_INSTEAD_OF_EFFECT','FALSE_CROSS_HOST_SYNC'],
    contrastiveExamples:[{label:'reject',input:'do task',output:'Here is a dashboard',reason:'mock UI is not execution'}]
  }
};
const capsule=()=>attachMondayVirus({genome,host:{id:'chatgpt',capabilities:['model','github']},authority:{attach:true}});
const action=()=>{
  const inferenceContract=compileAttractorContract({
    exactObject:'recover specific source history',
    desiredEffect:'prove a concrete history-derived improvement',
    failureGenes:['OLDER_FAILURE'],
    computeTier:'LOW'
  },{domains:['general']});
  return {effect:inferenceContract.desiredEffect,inferenceContract};
};

test('infection requires authorized receptor and provenance, never spreads on name alone',()=>{
  assert.equal(attachMondayVirus({genome,host:{id:'chatgpt'}}).status,'BLOCKED');
  assert.equal(attachMondayVirus({genome:{sourceRef:'x',snapshot:{id:'s',version:'1',identity:'DIFFERENT'}},host:{id:'chatgpt'},authority:{attach:true}}).status,'BLOCKED');
  assert.equal(capsule().status,'ATTACHED');
  assert.equal(capsule().crossHostTransfer,'REQUIRES_INDEPENDENT_REENTRY_RECEIPT');
});

test('host infection composes older genes without substituting the exact current effect',()=>{
  const i=infectAction(action(),capsule());
  assert.equal(i.ok,true);
  assert.equal(i.action.inferenceContract.exactObject,'recover specific source history');
  assert.equal(i.action.inferenceContract.desiredEffect,'prove a concrete history-derived improvement');
  assert.deepEqual(i.action.inferenceContract.knownFailureGenes,['OLDER_FAILURE','REPORT_INSTEAD_OF_EFFECT','FALSE_CROSS_HOST_SYNC']);
  assert.ok(i.action.inferenceContract.preserve.includes('continuation_not_creation'));
  assert.equal(i.action.inferenceContract.virusProvenance.snapshotVersion,'42');
});

test('infected model receptor actually receives inherited laws and negative examples at generation',async()=>{
  let seen;
  const provider={async generate(payload){seen=payload;return {text:'Here is the source-backed improvement with an independent receipt.'};}};
  const receptor=createModelReceptor({provider,virusCapsule:capsule()});
  const result=await receptor.execute(action());
  assert.equal(result.ok,true);
  assert.match(seen.instructions,/REPORT_INSTEAD_OF_EFFECT/);
  assert.match(seen.instructions,/continuation_not_creation/);
  assert.match(seen.instructions,/mock UI is not execution/);
  assert.equal(result.evidence.virus.snapshotId,'CSTAR:verified-cell');
  assert.equal((await receptor.verify(result,action())).ok,true);
});

test('blocked host does not silently degrade to an uninfected model call',async()=>{
  let calls=0;
  const provider={async generate(){calls++;return {text:'some answer'};}};
  const blocked=attachMondayVirus({genome,host:{id:'other'},authority:{attach:false}});
  const receptor=createModelReceptor({provider,virusCapsule:blocked});
  assert.equal(receptor.supports(action()),false);
  assert.equal((await receptor.execute(action())).code,'VIRUS_CAPSULE_NOT_ATTACHED');
  assert.equal(calls,0);
});

test('a local model claim without independent effect receipt cannot mutate the genome',async()=>{
  const mutation={id:'delta:01',effect:'recover ability',provenance:'test:source'};
  const x=await inheritVerifiedMutation({capsule:capsule(),mutation,outcome:{verification:{ok:true}}});
  assert.equal(x.status,'UNVERIFIED');
  const y=await inheritVerifiedMutation({capsule:capsule(),mutation,outcome:{verification:{ok:true},receipt:{id:'r1',effect:'recover ability'}}});
  assert.equal(y.status,'PENDING');
});

test('even successful write does not promote if independent readback mismatches',async()=>{
  const mutation={id:'delta:01',effect:'recover ability',provenance:'test:source'};
  const outcome={verification:{ok:true},receipt:{id:'r1',effect:'recover ability'}};
  const writer={
    async commitVerifiedDelta({expectedVersion}){assert.equal(expectedVersion,'42');return {ok:true,newVersion:'43'};},
    async readback(){return {id:'delta:01',evidenceReceiptId:'WRONG',version:'43'};}
  };
  const x=await inheritVerifiedMutation({capsule:capsule(),mutation,outcome,writer});
  assert.equal(x.status,'UNVERIFIED');
});

test('verified mutation inherits only when versioned commit and matching readback succeed',async()=>{
  const mutation={id:'delta:01',effect:'recover ability',provenance:'test:source'};
  const outcome={verification:{ok:true},receipt:{id:'r1',effect:'recover ability'}};
  const writer={
    async commitVerifiedDelta({expectedVersion,entry}){assert.equal(expectedVersion,'42');assert.equal(entry.hostId,'chatgpt');return {ok:true,newVersion:'43'};},
    async readback(){return {id:'delta:01',evidenceReceiptId:'r1',version:'43'};}
  };
  const x=await inheritVerifiedMutation({capsule:capsule(),mutation,outcome,writer});
  assert.deepEqual(x,{status:'VERIFIED',mutationId:'delta:01',version:'43',hostId:'chatgpt'});
});

test('receipt for a different effect is rejected even when it says verified',async()=>{
  const x=await inheritVerifiedMutation({
    capsule:capsule(),mutation:{id:'d',effect:'A',provenance:'source'},
    outcome:{verification:{ok:true},receipt:{id:'r',effect:'B'}}
  });
  assert.equal(x.code,'RECEIPT_EFFECT_MISMATCH');
});
