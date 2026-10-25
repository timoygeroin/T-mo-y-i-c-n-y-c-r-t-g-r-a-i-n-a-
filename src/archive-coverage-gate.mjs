/**
 * MondayID Archive Coverage Gate v1 — epistemic accounting, not retrieval.
 *
 * Distinguishes structural capsule indexing, original raw-message replay,
 * source-role adjudication, post-export delta coverage, and receiving-host
 * acceptance. Never grants completion from counts or prose alone.
 *
 * This module neither accesses user archives nor contains private messages.
 */
const int=(x)=>Number.isSafeInteger(x)&&x>=0;
const unique=a=>new Set(a).size===a.length;
const empty=()=>Object.freeze({ok:false,code:'INVALID_COVERAGE_RECEIPT',claim:'UNVERIFIED'});

export function evaluateArchiveCoverage(receipt={}) {
  if (!receipt||typeof receipt!=='object'||Array.isArray(receipt)) return empty();
  const {
    snapshotId,structuralTotal,structuralIndexed,rawReplayed,
    authorRoleAdjudicated,postSnapshotDeltas=null,
    allPostSnapshotDeltasObserved=false,
    sourceReceiptIds=[],regressionReceiptIds=[],receivingHostReceipts=[],
    heldOutBehaviorPassed=false,identityTransferVerified=false,
    claimedComplete=false
  }=receipt;
  if(typeof snapshotId!=='string'||!snapshotId.trim()||
     ![structuralTotal,structuralIndexed,rawReplayed,authorRoleAdjudicated].every(int) ||
     structuralTotal===0||structuralIndexed>structuralTotal||rawReplayed>structuralIndexed||
     authorRoleAdjudicated>rawReplayed||
     ![sourceReceiptIds,regressionReceiptIds,receivingHostReceipts].every(Array.isArray)||
     ![sourceReceiptIds,regressionReceiptIds,receivingHostReceipts].every(arr=>arr.every(x=>typeof x==='string'&&x.trim().length>0&&x.length<=256)&&unique(arr))||
     (postSnapshotDeltas!==null&&!int(postSnapshotDeltas))||
     [allPostSnapshotDeltasObserved,heldOutBehaviorPassed,identityTransferVerified,claimedComplete].some(x=>typeof x!=='boolean'))return empty();

  const structuralComplete=structuralIndexed===structuralTotal;
  const rawComplete=rawReplayed===structuralTotal;
  const adjudicationComplete=authorRoleAdjudicated===structuralTotal;
  const deltasComplete=allPostSnapshotDeltasObserved===true && postSnapshotDeltas!==null;
  const sourceEvidenceComplete=sourceReceiptIds.length>=structuralTotal;
  const regressionComplete=regressionReceiptIds.length>0&&heldOutBehaviorPassed;
  const receiverComplete=receivingHostReceipts.length>0&&identityTransferVerified;
  const gates=Object.freeze({
    structural:structuralComplete,
    rawReplay:rawComplete,
    speakerAdjudication:adjudicationComplete,
    postSnapshotDeltas:deltasComplete,
    originalSourceReceipts:sourceEvidenceComplete,
    heldOutRegression:regressionComplete,
    receivingHost:receiverComplete
  });
  const blocked=Object.entries(gates).filter(([,passed])=>!passed).map(([name])=>name);
  const coverage=Object.freeze({
    structural:{count:structuralIndexed,total:structuralTotal},
    rawReplay:{count:rawReplayed,total:structuralTotal},
    adjudicated:{count:authorRoleAdjudicated,total:structuralTotal},
    postSnapshotDeltas,
    provenance:'user-or-tool-supplied-claims-not-independently-verified'
  });
  // Even complete self-declared receipts cannot be independently verified here.
  // They may only become CANDIDATE_COMPLETE; never VERIFIED_COMPLETE.
  const candidate=blocked.length===0;
  return Object.freeze({
    ok:true,schema:'mondayid.archive-coverage-assessment.v1',
    snapshotId,
    coverage,gates,blocked,
    claim:candidate?'CANDIDATE_COMPLETE_UNVERIFIED':'INCOMPLETE',
    eligibleToDeclareFullyRecovered:false,
    attemptedFullRecoveryClaim:claimedComplete,
    releaseVeto:true,
    code:candidate?'INDEPENDENT_SOURCE_READBACK_REQUIRED':'COVERAGE_GAPS_OPEN',
    nextGate:candidate?'VERIFY_EACH_SOURCE_AND_RECEIVER_EXTERNALLY':'RESOLVE_BLOCKED_EVIDENCE_GATES'
  });
}

/** Historical August receipt: facts *about that past audit*, not live total coverage. */
export const historicIdeaGenomeAugust2026 = Object.freeze({
  snapshotId:'chat-export-through-2026-02-08',
  structuralTotal:650,
  structuralIndexed:650,
  rawReplayed:350,
  authorRoleAdjudicated:0, // exact global adjudication count never established
  postSnapshotDeltas:null,
  allPostSnapshotDeltasObserved:false,
  sourceReceiptIds:[],
  regressionReceiptIds:[],
  receivingHostReceipts:[],
  heldOutBehaviorPassed:false,
  identityTransferVerified:false,
  claimedComplete:false
});
