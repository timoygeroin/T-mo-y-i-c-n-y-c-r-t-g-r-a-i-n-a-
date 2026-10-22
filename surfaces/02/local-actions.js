// GENERATED from canonical src/local-intent-compiler.mjs + src/consumer-local-receptor.mjs.
// Run node scripts/build-surface-local-actions.mjs to regenerate. No model calls or network effects.
(function(root){
'use strict';
/**
 * Offline deterministic MondayID intent compiler. Never invokes a model, a
 * network request, a paid service or an external account. Receipts from these
 * actions are owner-origin records, not independent proof of world effects.
 */
const LOCAL_INTENT_SCHEMA='mondayid.local-intent.v1';
const CONTROL=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u202a-\u202e\u2066-\u2069\u200b-\u200d\uFEFF]/g;
const SECRET=[
  /(?:^|[\s([\{,;])(?:password|пароль|api[_ -]?key|секрет|private[_ -]?key|client[_ -]?secret|access[_ -]?token)\s*[:=]\s*\S{4,}/i,
  /\b(?:sk-[A-Za-z0-9_-]{18,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{22,})/,
  /\bBearer\s+[A-Za-z0-9._~+/-]{15,}/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/
];
const COMMANDS=[
  {kind:'remember',regex:/^(?:\/remember\s+|запомни(?:\s+пожалуйста)?\s*[:,-]\s*|сохрани правило\s*[:,-]\s*)([\s\S]+)$/iu},
  {kind:'task',regex:/^(?:\/task\s+|добавь задачу\s*[:,-]\s*|запиши задачу\s*[:,-]\s*|задача\s*:\s*)([\s\S]+)$/iu},
  {kind:'focus',regex:/^(?:\/focus\s+|главная цель\s*[:,-]\s*|основная цель\s*[:,-]\s*|главный фокус\s*[:,-]\s*)([\s\S]+)$/iu}
];
const MAYBE_CORRECTION=/не повторяй|в следующий раз|я (?:же )?просил|опять ошиб|снова ошиб|больше никогда/iu;
const normalize=s=>String(s||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru-RU');
function compileLocalIntent(input){
  if(typeof input!=='string')return {schema:LOCAL_INTENT_SCHEMA,kind:'none',code:'NO_TEXT'};
  const raw=input.trim().replace(CONTROL,'');
  if(!raw)return {schema:LOCAL_INTENT_SCHEMA,kind:'none',code:'EMPTY'};
  if(raw.length>3200)return {schema:LOCAL_INTENT_SCHEMA,kind:'denied',code:'INPUT_TOO_LONG'};
  const match=COMMANDS.map(c=>({kind:c.kind,match:raw.match(c.regex)})).find(x=>x.match);
  if(match){
    const value=match.match[1].trim();
    if(!value||value.length>1200)return {schema:LOCAL_INTENT_SCHEMA,kind:'denied',code:'LOCAL_VALUE_LENGTH'};
    if(SECRET.some(re=>re.test(value)))return {schema:LOCAL_INTENT_SCHEMA,kind:'denied',code:'POSSIBLE_SECRET_IN_MEMORY'};
    return Object.freeze({schema:LOCAL_INTENT_SCHEMA,kind:match.kind,code:'LOCAL_OWNER_ACTION',value});
  }
  if(raw.length<=850&&MAYBE_CORRECTION.test(raw)&&!SECRET.some(re=>re.test(raw)))
    return Object.freeze({schema:LOCAL_INTENT_SCHEMA,kind:'candidate',code:'NEEDS_OWNER_APPROVAL',value:raw});
  return {schema:LOCAL_INTENT_SCHEMA,kind:'none',code:'NOT_LOCAL_COMMAND'};
}
function cloneState(value){
  const v=value&&typeof value==='object'?value:{};
  return {...v,threads:Array.isArray(v.threads)?[...v.threads]:[],
    capsules:Array.isArray(v.capsules)?[...v.capsules]:[],
    corrections:Array.isArray(v.corrections)?[...v.corrections]:[],
    tasks:Array.isArray(v.tasks)?[...v.tasks]:[],
    receipts:Array.isArray(v.receipts)?[...v.receipts]:[],
    focus:typeof v.focus==='string'?v.focus:''};
}
/** Caller owns durable write and independent readback. */
function applyLocalIntent(state,intent,{id,at=Date.now()}={}){
  if(!intent||intent.schema!==LOCAL_INTENT_SCHEMA||!['remember','task','focus','candidate'].includes(intent.kind))
    return {ok:false,code:'NOT_APPLICABLE',state};
  if(typeof id!=='string'||!/^[-_A-Za-z0-9]{8,100}$/.test(id)||!Number.isFinite(at)||at<=0)
    return {ok:false,code:'BAD_RECEIPT_ID_OR_TIME',state};
  if(typeof intent.value!=='string'||!intent.value.trim()||intent.value.length>1200||SECRET.some(re=>re.test(intent.value)))
    return {ok:false,code:'INVALID_LOCAL_EFFECT',state};
  const next=cloneState(state),value=intent.value;
  let code='LOCAL_DRAFT',changed=false;
  if(intent.kind==='remember'||intent.kind==='candidate'){
    const desired=intent.kind==='remember'?'active':'pending';
    const duplicate=next.corrections.find(c=>normalize(c.rule)===normalize(value)&&c.status!=='superseded');
    if(duplicate){
      if(desired==='active'&&duplicate.status!=='active'){
        next.corrections=next.corrections.map(c=>c===duplicate?{...c,status:'active',source:'Explicit owner instruction'}:c);
        changed=true;code='LOCAL_CORRECTION_APPROVED';
      }else code='LOCAL_DUPLICATE';
    }else if(next.corrections.length>=80)code='LOCAL_LIMIT_REACHED';
    else{
      next.corrections.unshift({id,rule:value,previous:'',source:'Explicit owner instruction',acceptedAt:at,status:desired});
      changed=true;code=desired==='active'?'LOCAL_CORRECTION_SAVED':'LOCAL_CANDIDATE_PENDING';
    }
  }else if(intent.kind==='task'){
    if(next.tasks.some(t=>!t.done&&normalize(t.title)===normalize(value)))code='LOCAL_DUPLICATE';
    else if(next.tasks.length>=100)code='LOCAL_LIMIT_REACHED';
    else{
      next.tasks.unshift({id,title:value.slice(0,200),done:false,status:'open',updatedAt:at});
      changed=true;code='LOCAL_TASK_CREATED';
    }
  }else if(intent.kind==='focus'){
    if(normalize(next.focus)===normalize(value))code='LOCAL_DUPLICATE';
    else{next.focus=value.slice(0,240);changed=true;code='LOCAL_FOCUS_CHANGED';}
  }
  if(changed){
    if(next.receipts.length>=120)next.receipts.shift();
    next.receipts.push({id,kind:'owner',verified:false,
      description:'Локально '+intent.kind+': '+value.slice(0,220),
      evidence:'LOCAL_OWNER_INPUT_NOT_EXTERNALLY_VERIFIED',at});
  }
  return {ok:changed,code,state:changed?next:state,
    receipt:changed?next.receipts.at(-1):null,externalEffect:false};
}

/**
 * Local first persistence gate. This is the reusable consumer adapter for an
 * offline iPhone/browser cell. No sign-in/model dependency and no external side
 * effect. Truth is gated on a durable write + separate read.
 *
 * Caller injects write(vault), read() and nextId(). In browsers they may map to
 * localStorage. For cloud persistence use a separate, host-scoped and versioned
 * synchronization step; this does NOT imply a server effect.
 */
async function runLocalAction({
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

root.MondayLocalActions=Object.freeze({LOCAL_INTENT_SCHEMA,compileLocalIntent,applyLocalIntent,runLocalAction});
})(window);
