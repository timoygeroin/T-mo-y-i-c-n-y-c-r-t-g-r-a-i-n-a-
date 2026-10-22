import { createHash } from 'node:crypto';

// A small, provider-independent effect ABI.
// Hashes detect changes; they DO NOT authenticate authors or prove outcomes.
const SCHEMA='monday.effect-abi.v0';
const PRIVACY=['local','delegated'];
const SIDE_EFFECT=['local','external'];
const KEYS=['schema','id','intent','capability','privacy','maxCostUsd','sideEffect','digest'];
const str=(x,max=500)=>typeof x==='string'&&x.trim()&&x.length<=max;
const stable=(o)=>JSON.stringify(o,Object.keys(o).sort());
const digest=(o)=>createHash('sha256').update(stable(o)).digest('hex');
const blocked=(capsule,code,host=null)=>({schema:'monday.effect-receipt.v0',status:'BLOCKED',code,host,
  capsuleDigest:capsule?.digest||null,verification:null});

export function makeEffectCapsule({id,intent,capability,privacy='local',maxCostUsd=0,sideEffect='local'}={}) {
  if(!str(id,140)||!str(intent,5000))throw new Error('INTENT_REQUIRED');
  if(!str(capability,160)||!/^[a-z][a-z0-9._:-]*$/i.test(capability))throw new Error('CAPABILITY_INVALID');
  if(!PRIVACY.includes(privacy))throw new Error('PRIVACY_INVALID');
  if(!Number.isFinite(maxCostUsd)||maxCostUsd<0)throw new Error('BUDGET_INVALID');
  if(!SIDE_EFFECT.includes(sideEffect))throw new Error('SIDE_EFFECT_INVALID');
  const payload={schema:SCHEMA,id,intent,capability,privacy,maxCostUsd,sideEffect};
  return Object.freeze({...payload,digest:digest(payload)});
}

export async function runEffectCapsule(capsule,{adapter,verify,authorize}={}) {
  // Capsules are data, not privileged instructions. Recompute digest after transfer.
  if(!capsule||capsule.schema!==SCHEMA || Object.keys(capsule).some(k=>!KEYS.includes(k)) || KEYS.some(k=>!(k in capsule))) return blocked(capsule,'INVALID_CAPSULE');
  let canonical;
  try{canonical=makeEffectCapsule(capsule)}catch{return blocked(capsule,'INVALID_CAPSULE');}
  if(canonical.digest!==capsule.digest)return blocked(capsule,'CAPSULE_TAMPERED');
  const host=typeof adapter?.id==='string'?adapter.id:null;
  if(!host||typeof adapter.execute!=='function'||!Array.isArray(adapter.capabilities))return blocked(capsule,'HOST_INVALID',host);
  if(!adapter.capabilities.includes(capsule.capability))return blocked(capsule,'CAPABILITY_UNAVAILABLE',host);
  if(capsule.privacy==='local'&&adapter.privacy!=='local')return blocked(capsule,'PRIVACY_BOUNDARY',host);
  if(typeof adapter.estimate!=='function')return blocked(capsule,'UNKNOWN_COST',host);
  if(typeof verify!=='function')return blocked(capsule,'VERIFIER_REQUIRED',host);
  let cost;
  try{cost=await adapter.estimate(capsule)}catch{return blocked(capsule,'UNKNOWN_COST',host)}
  if(!Number.isFinite(cost)||cost<0)return blocked(capsule,'UNKNOWN_COST',host);
  if(cost>capsule.maxCostUsd)return blocked(capsule,'BUDGET_EXCEEDED',host);
  if(capsule.sideEffect==='external'||capsule.privacy==='delegated'||cost>0){
    if(typeof authorize!=='function')return blocked(capsule,'AUTHORIZATION_REQUIRED',host);
    let approved=false;
    try{approved=await authorize({capsule,host,estimatedCostUsd:cost})===true}catch{}
    if(!approved)return blocked(capsule,'AUTHORIZATION_REQUIRED',host);
  }
  let result;
  try{result=await adapter.execute(capsule)}catch(error){
    // Effect may have occurred despite an exception: never assert success.
    return {schema:'monday.effect-receipt.v0',status:'UNVERIFIED',code:'EXECUTION_AMBIGUOUS',
      host,capsuleDigest:capsule.digest,estimatedCostUsd:cost,verification:null,
      error:String(error?.message||error)};
  }
  let verification;
  try{verification=await verify({capsule,host,result})}catch(error){verification={ok:false,evidence:String(error?.message||error)}}
  if(verification?.ok!==true || !str(verification?.evidence,2000)){
    return {schema:'monday.effect-receipt.v0',status:'UNVERIFIED',code:'READBACK_UNVERIFIED',
      host,capsuleDigest:capsule.digest,estimatedCostUsd:cost,verification:{ok:false,evidence:String(verification?.evidence||'No independent readback')}};
  }
  return {schema:'monday.effect-receipt.v0',status:'VERIFIED',code:null,
    host,capsuleDigest:capsule.digest,estimatedCostUsd:cost,
    verification:{ok:true,evidence:verification.evidence}};
}
