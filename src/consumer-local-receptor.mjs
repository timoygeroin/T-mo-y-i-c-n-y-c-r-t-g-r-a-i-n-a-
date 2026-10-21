import {compileLocalIntent,applyLocalIntent} from './local-intent-compiler.mjs';

/**
 * Local first persistence gate. This is the reusable consumer adapter for an
 * offline iPhone/browser cell. No sign-in/model dependency and no external side
 * effect. Truth is gated on a durable write + separate read.
 *
 * Caller injects write(vault), read() and nextId(). In browsers they may map to
 * localStorage. For cloud persistence use a separate, host-scoped and versioned
 * synchronization step; this does NOT imply a server effect.
 */
export async function runLocalAction({
  text,state,write,read,nextId,at=Date.now()
}={}){
  const intent=compileLocalIntent(text);
  if(intent.kind==='none')return {handled:false,code:intent.code};
  if(intent.kind==='denied')return {handled:true,ok:false,code:intent.code};
  if(typeof write!=='function'||typeof read!=='function'||typeof nextId!=='function'){
    return {handled:true,ok:false,code:'NO_PERSISTENCE_RECEPTOR'};
  }
  const id=nextId();
  const transition=applyLocalIntent(state,intent,{id,at});
  if(!transition.ok)return {handled:true,ok:false,code:transition.code};
  try{
    const saved=await write(transition.state);
    if(saved===false)return {handled:true,ok:false,code:'LOCAL_WRITE_FAILED'};
  }catch{return {handled:true,ok:false,code:'LOCAL_WRITE_FAILED'};}
  let projected;
  try{projected=await read();}catch{return {handled:true,ok:false,code:'LOCAL_READBACK_UNAVAILABLE'};}
  const receipts=Array.isArray(projected?.receipts)?projected.receipts:[];
  const found=receipts.find(r=>r.id===id);
  if(!found||found.kind!=='owner'||found.verified!==false||
     found.evidence!=='LOCAL_OWNER_INPUT_NOT_EXTERNALLY_VERIFIED'){
    return {handled:true,ok:false,code:'LOCAL_READBACK_MISMATCH'};
  }
  let effect=false;
  if(intent.kind==='remember'||intent.kind==='candidate'){
    const c=projected?.corrections?.find(x=>x.rule===intent.value && x.status===(intent.kind==='remember'?'active':'pending'));
    effect=Boolean(c);
  }else if(intent.kind==='task'){
    effect=Boolean(projected?.tasks?.some(x=>x.title===intent.value.slice(0,200)&&x.done===false));
  }else if(intent.kind==='focus'){
    effect=projected?.focus===intent.value.slice(0,240);
  }
  if(!effect)return {handled:true,ok:false,code:'LOCAL_EFFECT_NOT_IN_READBACK'};
  return {handled:true,ok:true,code:'LOCAL_VERIFIED_READBACK',kind:intent.kind,
    receiptId:id,independentExternalEffect:false,requiresCloudSync:true};
}
