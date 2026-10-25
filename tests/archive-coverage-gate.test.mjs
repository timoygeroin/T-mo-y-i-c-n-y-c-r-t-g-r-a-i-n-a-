import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateArchiveCoverage,historicIdeaGenomeAugust2026} from '../src/archive-coverage-gate.mjs';

const base=()=>({...historicIdeaGenomeAugust2026});
test('historical archive indexing is not complete coverage',()=>{
 const v=evaluateArchiveCoverage(base());
 assert.equal(v.ok,true);
 assert.equal(v.coverage.structural.count,650);
 assert.equal(v.coverage.rawReplay.count,350);
 assert.equal(v.gates.structural,true);
 assert.equal(v.gates.rawReplay,false);
 assert.equal(v.claim,'INCOMPLETE');
 assert.equal(v.eligibleToDeclareFullyRecovered,false);
 assert.equal(v.releaseVeto,true);
});
test('complete raw counts still require adjudication and receiver checks',()=>{
 const input=base();input.rawReplayed=650;input.authorRoleAdjudicated=650;
 const v=evaluateArchiveCoverage(input);
 assert.equal(v.gates.rawReplay,true);
 assert.equal(v.gates.originalSourceReceipts,false);
 assert.equal(v.gates.receivingHost,false);
});
test('all self-reported gates still require independent readback',()=>{
 const input=base();input.rawReplayed=650;input.authorRoleAdjudicated=650;
 input.postSnapshotDeltas=0;input.allPostSnapshotDeltasObserved=true;
 input.sourceReceiptIds=Array.from({length:650},(_,i)=>'source:'+i);
 input.regressionReceiptIds=['heldout:one'];input.heldOutBehaviorPassed=true;
 input.receivingHostReceipts=['receiver:one'];input.identityTransferVerified=true;
 const v=evaluateArchiveCoverage(input);
 assert.deepEqual(v.blocked,[]);
 assert.equal(v.claim,'CANDIDATE_COMPLETE_UNVERIFIED');
 assert.equal(v.eligibleToDeclareFullyRecovered,false);
 assert.equal(v.code,'INDEPENDENT_SOURCE_READBACK_REQUIRED');
});
test('contradictory counts and duplicate source receipts are invalid',()=>{
 const a=base();a.rawReplayed=651;
 assert.equal(evaluateArchiveCoverage(a).ok,false);
 const b=base();b.authorRoleAdjudicated=351;
 assert.equal(evaluateArchiveCoverage(b).ok,false);
 const c=base();c.sourceReceiptIds=['a','a'];
 assert.equal(evaluateArchiveCoverage(c).ok,false);
});
