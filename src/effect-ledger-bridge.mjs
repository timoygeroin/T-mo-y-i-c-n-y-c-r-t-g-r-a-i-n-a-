import { makeEffectCapsule, runEffectCapsule } from './effect-abi.mjs';

// Single execution authority: caller supplies the canonical runtime's ActionLedger.
// There is intentionally no new ledger, persistent store, model or parallel scheduler.
const fields=['schema','id','intent','capability','privacy','maxCostUsd','sideEffect','digest'];
const hasMethods=(x,names)=>x && names.every(name=>typeof x[name]==='function');
const refusal=(capsule,code,ledger=null)=>({
  status:'BLOCKED', code, capsuleDigest:capsule?.digest||null,
  ledger:ledger ? {actionKey:ledger.actionKey||null,state:ledger.state||'UNRESOLVED'} : null
});
const validCapsule=(capsule)=>{
  if(!capsule || typeof capsule!=='object' || Array.isArray(capsule) ||
      Object.keys(capsule).length!==fields.length ||
      fields.some(key=>!Object.hasOwn(capsule,key)))return false;
  try {
    const rebuilt=makeEffectCapsule(capsule);
    return capsule.schema===rebuilt.schema && capsule.digest===rebuilt.digest;
  } catch {return false;}
};
const effectAction=(capsule)=>({
  id:capsule.id, objectiveId:capsule.id, sourceSignal:'effect-abi',
  domain:capsule.capability, effect:capsule.intent,
  routeCandidate:{id:capsule.digest}
});

// Recover only *proven* organs. Never call the Foundry builder from this bridge:
// building might itself have external effects, cost or require new authorization.
async function resolveFromRuntime(capsule,runtime,action) {
  if(!runtime)return null;
  let receptor=runtime.capabilities?.[capsule.capability];
  if(!receptor && runtime.foundry &&
      hasMethods(runtime.foundry,['propose','recoverProven'])) {
    const available=runtime.capabilities||{};
    const proposed=runtime.foundry.propose(action,available);
    const recovered=await runtime.foundry.recoverProven(proposed,available);
    if(recovered?.ok===true)receptor=recovered.candidate?.receptor;
  }
  if(!receptor || typeof receptor.execute!=='function')return null;
  if(typeof receptor.supports==='function' && receptor.supports(action)!==true)return null;
  const adapter={
    id:typeof receptor.name==='string' ? receptor.name : 'canonical-receptor',
    privacy:receptor.privacy, // Unknown privacy fails closed in Effect ABI.
    capabilities:[capsule.capability],
    estimate:typeof receptor.estimate==='function'
      ? (c)=>receptor.estimate(c) : undefined,
    execute:(c)=>receptor.execute({...action, capsule:c, idempotencyKey:`effect:${c.digest}`})
  };
  const verify=typeof receptor.verify==='function'
    ? async ({result})=>{
      const proof=await receptor.verify(result,action);
      const evidence=proof?.evidenceRef||proof?.evidence;
      return {ok:proof?.ok===true,evidence:typeof evidence==='string'?evidence:''};
    } : undefined;
  return {adapter,verify};
}

export async function runGovernedEffect(capsule,{
  runtime=null,ledger=null,adapter=null,verify=null,authorize=null,
  cellId='cell:effect'
}={}) {
  if(!validCapsule(capsule))return refusal(capsule,'INVALID_CAPSULE');
  const canonicalLedger=runtime?.actionLedger || ledger;
  if(!hasMethods(canonicalLedger,['prepare','reserve','start','fail','ambiguous','verify','commit','read']))
    return refusal(capsule,'CANONICAL_LEDGER_REQUIRED');

  const action=effectAction(capsule);
  let selected=adapter,readback=verify;
  if(!selected && runtime) {
    try {
      const recovered=await resolveFromRuntime(capsule,runtime,action);
      selected=recovered?.adapter||null;
      readback=readback||recovered?.verify||null;
    } catch {
      return refusal(capsule,'CAPABILITY_RECOVERY_FAILED');
    }
  }

  const prepared=canonicalLedger.prepare(action,{
    cellId,idempotencyKey:`effect:${capsule.digest}`
  });
  if(!prepared.ok)return refusal(capsule,prepared.code||'ACTION_PREPARE_FAILED');
  const actionKey=prepared.actionKey;
  const reserved=canonicalLedger.reserve(actionKey,{cellId});
  if(!reserved.ok)return refusal(capsule,reserved.code||'ACTION_RESERVATION_FAILED',{
    actionKey,state:reserved.record?.state||'UNRESOLVED'
  });

  if(reserved.reused===true) {
    if(reserved.record?.state==='VERIFIED') {
      const commit=canonicalLedger.commit(actionKey);
      if(!commit.ok)return refusal(capsule,'ACTION_COMMIT_FAILED',{actionKey,state:'VERIFIED'});
    }
    const old=canonicalLedger.read(actionKey)?.outcome?.receipt;
    return old
      ? {...old,reused:true,ledger:{actionKey,state:'COMMITTED',reused:true}}
      : refusal(capsule,'ACTION_LEDGER_OUTCOME_MISSING',{actionKey,state:'COMMITTED'});
  }
  if(reserved.reusedReservation && reserved.record?.state==='EXECUTING')
    return refusal(capsule,'ACTION_ALREADY_EXECUTING',{actionKey,state:'EXECUTING'});

  const token=reserved.token;
  const started=canonicalLedger.start(actionKey,token);
  if(!started.ok)return refusal(capsule,started.code||'ACTION_START_FAILED',{
    actionKey,state:started.record?.state||'UNRESOLVED'
  });
  try {
    const receipt=await runEffectCapsule(capsule,{
      adapter:selected,verify:readback,authorize
    });
    const outcome={receipt,action};
    if(receipt.status==='BLOCKED') {
      canonicalLedger.fail(actionKey,token,outcome);
      return {...receipt,ledger:{actionKey,state:'FAILED'}};
    }
    if(receipt.status!=='VERIFIED') {
      canonicalLedger.ambiguous(actionKey,token,outcome,receipt.code||'READBACK_UNRESOLVED');
      return {...receipt,ledger:{actionKey,state:'AMBIGUOUS'}};
    }
    const verified=canonicalLedger.verify(actionKey,token,{
      verification:{
        ok:true,mode:'effect-abi-readback',evidenceRef:receipt.verification.evidence,
        capsuleDigest:capsule.digest
      },outcome
    });
    if(!verified.ok) {
      canonicalLedger.ambiguous(actionKey,token,outcome,'ACTION_LEDGER_VERIFY_FAILED');
      return {...receipt,status:'UNVERIFIED',code:'ACTION_LEDGER_VERIFY_FAILED',
        ledger:{actionKey,state:'AMBIGUOUS'}};
    }
    const committed=canonicalLedger.commit(actionKey,token);
    if(!committed.ok)return {...receipt,status:'UNVERIFIED',code:'ACTION_COMMIT_FAILED',
      ledger:{actionKey,state:'VERIFIED'}};
    return {...receipt,ledger:{actionKey,state:'COMMITTED',reused:false}};
  } catch(error) {
    const msg=String(error?.message||error);
    canonicalLedger.ambiguous(actionKey,token,{error:msg,action},'BRIDGE_EXCEPTION_AFTER_START');
    return {status:'UNVERIFIED',code:'BRIDGE_EXCEPTION_AFTER_START',
      capsuleDigest:capsule.digest,error:msg,ledger:{actionKey,state:'AMBIGUOUS'}};
  }
}
