/**
 * Deterministic second-order observer for MondayID.
 *
 * This is an evidence/claim reconciliation mechanism, NOT sentience,
 * introspective access to model internals or a cross-host interception layer.
 * It cannot assert real-world effects without receptor receipts.
 */
export const META_OBSERVATION_SCHEMA='mondayid.meta-observation.v1';
const arr=value=>Array.isArray(value)?value:[];
const records=value=>Array.isArray(value)?value:Object.values(value||{});
const uniq=xs=>[...new Set(xs.filter(Boolean))];

const WHOLE_SCOPE='WHOLE_ORGANISM';
function isEffectProof(entry){
  const proof=entry?.verification;
  return entry?.ok===true &&
    proof?.ok===true &&
    typeof proof.mode==='string' && proof.mode.trim().length>0 &&
    typeof proof.evidenceRef==='string' && proof.evidenceRef.trim().length>0 &&
    proof.independentProof?.source==='HOST_READER' &&
    proof.independentProof?.effectId===entry.action?.id &&
    proof.independentProof?.domain===entry.action?.domain &&
    proof.independentProof?.sourceSignal===entry.action?.sourceSignal &&
    typeof proof.independentProof?.evidenceRef==='string' &&
    proof.independentProof.evidenceRef.trim().length>0;
}

/**
 * Require the observation to agree with reality: WANT (material obligations),
 * CAN (presently selected matching receptors) and KNOW (effects whose
 * verification is independently traceable in this recorded runtime).
 */
export function compileMetaObservation({
  intents={},frontier={},results=[],receipts={}
}={}){
  const active=records(intents).filter(i=>i?.amplification?.scope===WHOLE_SCOPE);
  const local={
    schema:META_OBSERVATION_SCHEMA,
    mode:'EVIDENCE_BASED_SELF_AUDIT',
    consciousnessClaim:false
  };
  if(!active.length) return Object.freeze({
    ...local,state:'TASK_LOCAL',integrated:false,
    filters:Object.freeze({want:[],can:[],know:[]}),
    gaps:[],predictionErrors:[],nextAdmissibleAction:null
  });

  const obligations=active.flatMap(intent=>arr(intent.obligations).filter(o=>o.material!==false));
  const required=uniq(obligations.map(o=>String(o.domain||'')));
  const ready=arr(frontier?.ready).filter(a=>a?.executable!==false && a?.receptor);
  const can=uniq(ready.map(a=>a.domain)).filter(domain=>required.includes(domain));
  const failed=arr(results).filter(r=>r?.ok!==true);
  const predictionErrors=failed.flatMap(r=>{
    const claimed=r?.result?.verified===true || Boolean(r?.result?.receipt) ||
      r?.result?.status==='COMPLETED';
    return claimed ? [{
      domain:r?.action?.domain||null,
      code:'SELF_CLAIM_WITHOUT_READBACK',
      failedProof:r?.verification?.code||'UNVERIFIED'
    }] : [];
  });

  // The worldline ledger contains prior-cycle receipts. Current results are
  // included for pre-persist tests and do not gain priority over proof rules.
  const recorded=[...records(receipts),...arr(results)];
  const proved=recorded.filter(isEffectProof).filter(entry=>
    active.some(i=>entry?.action?.sourceSignal===i.id ||
      (active.length===1 && !entry?.action?.sourceSignal))
  );

  const know=required.filter(domain=>proved.some(x=>x.action?.domain===domain &&
    (domain!=='integration' || x.verification.mode==='external-exact-readback')));

  const missing=required.filter(domain=>!know.includes(domain));
  const gaps=missing.map(domain=>{
    const blocker=arr(frontier?.blocked).find(x=>x.domain===domain)?.blocker||null;
    return {domain,code:blocker?'BLOCKED_RECEPTOR':'INDEPENDENT_EFFECT_READBACK_MISSING',blocker};
  });
  const integrated=required.includes('integration') && know.includes('integration');
  const allClosed=active.every(intent=>intent.status==='fulfilled' &&
    arr(intent.obligations).every(o=>o.material===false || o.status!=='OPEN'));
  const state=missing.length===0 && integrated && allClosed ? 'VERIFIED' : 'HOLD';
  return Object.freeze({
    ...local,
    state,integrated,
    filters:Object.freeze({
      want:obligations.map(o=>({domain:o.domain,id:o.id,status:o.status})),
      can,know
    }),
    gaps,predictionErrors,
    nextAdmissibleAction:gaps[0] ? {
      domain:gaps[0].domain,
      operation:gaps[0].blocker?'RECOVER_OR_BUILD_RECEPTOR':'OBTAIN_INDEPENDENT_READBACK'
    } : allClosed ? null : {operation:'SETTLE_OPEN_MATERIAL_OBLIGATIONS'}
  });
}
