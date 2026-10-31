/** MondayID One Pass Year: bounded causal compression of known work.
 * An executor's claim is NEVER accepted as evidence of effect; probe must be a
 * distinct trusted host receptor (and its trust is a host obligation, not
 * something a model-supplied boolean can certify).
 * No networking, autonomous scheduling, or future claims are made here.
 */
const text = x => typeof x === 'string' ? x.trim() : '';
const uniq = xs => [...new Set(xs)];
const nval = (v,lo,hi,def) => Number.isInteger(v) ? Math.max(lo,Math.min(hi,v)) : def;
const frozen = obj => Object.freeze(obj);
const canExecute = task => task.authorized === true && task.reversible === true && task.cost === 0 && task.humanGate !== true && task.externalPublication !== true;
const urgent = t => ((t.currentOwnerPriority === true ? 100000 : 0) + (Number(t.impact) || 0)*100 + (Number(t.recurrenceCost) || 0)*10 + (Number(t.informationGain) || 0));

export function compileKnownFrontier(tasks, {asOf=new Date().toISOString()}={}) {
  if(!Number.isFinite(Date.parse(asOf))) throw new Error('AS_OF_REQUIRED');
  const byId=new Map(), failures=[], duplicateIds=[];
  for(const item of Array.isArray(tasks) ? tasks : []) {
    const id=text(item?.id), effectId=text(item?.effectId);
    if(!id || !effectId) {failures.push({code:'INVALID_TASK_ID_OR_EFFECT',id:id||null});continue;}
    if(byId.has(id)) {
      const p=byId.get(id);
      if(p.effectId!==effectId || JSON.stringify(p.dependsOn||[])!==JSON.stringify(item.dependsOn||[]))
        failures.push({code:'CONFLICTING_TASK_ID',id});
      else duplicateIds.push(id);
      continue;
    }
    const task=frozen({...item,id,effectId,
      dependsOn:frozen(uniq((Array.isArray(item.dependsOn)?item.dependsOn:[]).map(text).filter(Boolean))),
      resources:frozen(uniq((Array.isArray(item.resources)?item.resources:[]).map(text).filter(Boolean))),
      objectId:text(item.objectId)||'unspecified-object',
      routeId:text(item.routeId)||'default-route',
      score:urgent(item)
    });
    byId.set(id,task);
  }
  const blocked = new Map();
  for(const task of byId.values()) {
    if(task.dependsOn.includes(task.id)) blocked.set(task.id,'SELF_DEPENDENCY');
    else if(task.dependsOn.some(dep=>!byId.has(dep))) blocked.set(task.id,'MISSING_DEPENDENCY');
    else if(task.notBefore && (!Number.isFinite(Date.parse(task.notBefore)) || Date.parse(task.notBefore)>Date.parse(asOf))) blocked.set(task.id,'FUTURE_OR_UNKNOWN_EVENT');
    else if(!canExecute(task)) blocked.set(task.id,task.humanGate?'HUMAN_GATE':'AUTHORITY_OR_REVERSIBILITY_GATE');
  }
  const visiting=new Set(), visited=new Set();
  function dfs(id){
    if(visiting.has(id)) return true;
    if(visited.has(id) || blocked.has(id)) return false;
    visiting.add(id);
    for(const dep of byId.get(id).dependsOn) if(byId.has(dep)&&dfs(dep)){blocked.set(id,'CYCLIC_DEPENDENCY');break;}
    visiting.delete(id);visited.add(id);
    return blocked.get(id)==='CYCLIC_DEPENDENCY';
  }
  for(const id of byId.keys())dfs(id);
  // Same effect + same task constraint set is a duplicate, not additional work.
  const fingerprint=new Map();
  for(const task of byId.values()) {
    const key=JSON.stringify({objectId:task.objectId,effectId:task.effectId,routeId:task.routeId,dependsOn:task.dependsOn,resources:task.resources,notBefore:task.notBefore||null});
    if(fingerprint.has(key)){ blocked.set(task.id,'DUPLICATE_EFFECT');duplicateIds.push(task.id); }
    else fingerprint.set(key,task.id);
  }
  return frozen({schema:'mondayid.known-frontier.v1',asOf,
    tasks:frozen([...byId.values()]),
    blocked:frozen(Object.fromEntries(blocked)),
    duplicateIds:frozen(uniq(duplicateIds)),failures:frozen(failures)});
}

function effectReceiptMatches(task,attempt,readback) {
  // Deliberately ignore attempt.claimsCompleted, attempt.receipt and attempt.verified.
  return Boolean(readback && readback.verified===true && readback.independent===true &&
    readback.observerClass==='trusted-host-receptor' && readback.noOpRejected===true &&
    text(readback.id) && readback.taskId===task.id && readback.effectId===task.effectId &&
    readback.effectObserved===true && readback.objectId===task.objectId && readback.attemptId===attempt?.attemptId);
}

function selectIndependentBatch(ready,maxConcurrency) {
  const used=new Set(), picked=[];
  for(const task of ready.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id))) {
    const resourceSet=[...task.resources,`effect:${task.objectId}:${task.effectId}`];
    if(resourceSet.some(resource=>used.has(resource)))continue;
    picked.push(task);for(const resource of resourceSet)used.add(resource);
    if(picked.length>=maxConcurrency)break;
  }
  return picked;
}

/** Run every currently reachable safe task, not every unknowable future event.
 * Host supplies real execute, independent probe and optional durable write+readback.
 * In the absence of a durable writer, observed effects are NEVER called inherited.
 */
export async function compressKnownYear({
  tasks=[],asOf=new Date().toISOString(),execute,probe,
  persist=null,readPersisted=null,expectedVersion=null,
  recover=null,recheck=null,
  maxActions=64,maxConcurrency=4,maxGenerations=32,
  targetEffectIds=[]
}={}) {
  const frontier=compileKnownFrontier(tasks,{asOf});
  const limits={actions:nval(maxActions,1,256,64),concurrency:nval(maxConcurrency,1,8,4),generations:nval(maxGenerations,1,64,32)};
  const accepted=[], reused=[], rejected=[], events=[], unresolved={...frontier.blocked}, done=new Set();
  let actions=0, generations=0, version=expectedVersion;
  if(typeof execute!=='function'||typeof probe!=='function')
    return frozen({status:'NO_TRUSTED_EXECUTOR_OR_PROBE',frontier,accepted,events,unresolved,actions,generations,durable:false});
  if(frontier.failures.length) return frozen({status:'INVALID_FRONTIER',frontier,accepted,events,unresolved,actions,generations,durable:false});
  let stop='EVIDENCE_PLATEAU';
  let lastDurable=false, durableConflict=false;
  // Two independent host callbacks are required to reuse prior work.
  // A stored claim without a fresh effect readback never qualifies.
  if(typeof recover==='function'&&typeof recheck==='function'){
    for(const task of frontier.tasks){
      if(unresolved[task.id])continue;
      try{
        const old=await recover(task);
        const valid=old?.verified===true && old?.independent===true &&
          old?.observerClass==='trusted-host-receptor' && old?.noOpRejected===true &&
          old?.effectObserved===true && text(old?.receiptId) &&
          old?.taskId===task.id && old?.effectId===task.effectId && old?.objectId===task.objectId;
        if(!valid)continue;
        const fresh=await recheck(task,old);
        if(fresh?.ok===true && fresh?.effectObserved===true &&
          fresh?.taskId===task.id && fresh?.effectId===task.effectId && fresh?.objectId===task.objectId){
          done.add(task.id);reused.push({taskId:task.id,effectId:task.effectId,receiptId:old.receiptId});
          events.push({generation:0,taskId:task.id,status:'PRIOR_EFFECT_REVERIFIED_NO_REEXECUTION'});
        }
      }catch{/* a failed recheck means stale or unavailable, not verified. */}
    }
  }
  // A recovered successful route satisfies its exact effect, so sibling
  // methods must not be blindly retried on next wake.
  for(const recovered of reused){
    const source=frontier.tasks.find(t=>t.id===recovered.taskId);
    if(!source)continue;
    for(const other of frontier.tasks){
      if(other.id!==source.id&&other.objectId===source.objectId&&other.effectId===source.effectId){
        done.add(other.id);delete unresolved[other.id];
        events.push({generation:0,taskId:other.id,status:'SIBLING_ROUTE_SKIPPED_REENTERED_EFFECT'});
      }
    }
  }
  while(actions<limits.actions && generations<limits.generations){
    const ready=frontier.tasks.filter(t=>!done.has(t.id)&&!unresolved[t.id]&&t.dependsOn.every(dep=>done.has(dep)));
    if(!ready.length){stop='EVIDENCE_PLATEAU';break;}
    const batch=selectIndependentBatch(ready,Math.min(limits.concurrency,limits.actions-actions));
    if(!batch.length){stop='EVIDENCE_PLATEAU';break;}
    generations++;
    const observed=await Promise.all(batch.map(async task=>{
      try{
        const attempt=await execute(task);
        const outcome=await probe(task,attempt);
        return {task,attempt,outcome,matched:effectReceiptMatches(task,attempt,outcome)};
      }catch(error){return {task,matched:false,error:String(error)};}
    }));
    actions+=batch.length;
    let batchProgress=false;
    for(const x of observed){
      if(!x.matched){
        unresolved[x.task.id]='INDEPENDENT_EFFECT_NOT_VERIFIED';
        rejected.push({id:x.task.id,effectId:x.task.effectId,reason:unresolved[x.task.id],error:x.error||null});
        events.push({generation:generations,taskId:x.task.id,status:'REJECTED_UNVERIFIED'});
        continue;
      }
      const record={taskId:x.task.id,effectId:x.task.effectId,objectId:x.task.objectId,receiptId:x.outcome.id,attemptId:x.attempt.attemptId};
      let durable=false, attemptedDurableWrite=false;
      if(typeof persist==='function'&&typeof readPersisted==='function'&&text(version)){
        attemptedDurableWrite=true;
        try{
          const written=await persist({expectedVersion:version,record});
          if(written?.ok===true && text(written.version)){
            const checked=await readPersisted({taskId:x.task.id,version:written.version});
            durable=checked?.taskId===x.task.id && checked?.effectId===x.task.effectId && checked?.objectId===x.task.objectId &&
              checked?.receiptId===x.outcome.id && String(checked?.version)===String(written.version);
            if(durable)version=String(written.version);
          }
        }catch{/* Effect may have occurred, but unconfirmed write cannot be claimed inherited. */}
      }
      if(attemptedDurableWrite&&!durable){
        durableConflict=true;
        events.push({generation:generations,taskId:x.task.id,status:'DURABLE_CONFLICT_OR_FAILED_READBACK'});
      }
      done.add(x.task.id);batchProgress=true;
      // A successful effect renders other routes to the same exact object/effect
      // redundant, including a previously failed route. It does not count as
      // another executed action or a separate verified result.
      for(const other of frontier.tasks){
        if(other.id===x.task.id||other.objectId!==x.task.objectId||other.effectId!==x.task.effectId)continue;
        done.add(other.id);delete unresolved[other.id];
        events.push({generation:generations,taskId:other.id,status:'ALTERNATIVE_ROUTE_SKIPPED_AFTER_EFFECT'});
      }
      lastDurable=durable;
      accepted.push({...record,durable});
      events.push({generation:generations,taskId:x.task.id,status:durable?'INHERITED_WITH_READBACK':'EFFECT_OBSERVED_NOT_DURABLY_INHERITED'});
    }
    if(durableConflict){stop='DURABLE_HEAD_RECONCILIATION_REQUIRED';break;}
    if(targetEffectIds.length && targetEffectIds.every(id=>accepted.some(a=>a.effectId===id)||reused.some(a=>a.effectId===id))){stop='TARGET_EFFECT_OBSERVED';break;}
    // A failed route does not imply that all alternative routes are blocked.
    // Keep trying distinct, previously unexecuted safe routes for the same
    // effect and independent work until exhausted or budgeted.
  }
  if(!['TARGET_EFFECT_OBSERVED','DURABLE_HEAD_RECONCILIATION_REQUIRED'].includes(stop)&&(actions>=limits.actions||generations>=limits.generations))stop='PASS_BUDGET';
  const remaining=frontier.tasks.filter(t=>!done.has(t.id)&&!unresolved[t.id]).map(t=>({taskId:t.id,effectId:t.effectId,waitingOn:t.dependsOn.filter(d=>!done.has(d))}));
  const future=Object.entries(unresolved).filter(([,reason])=>reason==='FUTURE_OR_UNKNOWN_EVENT').map(([id])=>id);
  const human=Object.entries(unresolved).filter(([,reason])=>reason==='HUMAN_GATE').map(([id])=>id);
  return frozen({schema:'mondayid.one-pass-year.v1',status:stop,actions,generations,
    accepted:frozen(accepted),reused:frozen(reused),rejected:frozen(rejected),events:frozen(events),
    unresolved:frozen(unresolved),remaining:frozen(remaining),future:frozen(future),human:frozen(human),
    lastDurable,durableConflict,version,claimScope:'KNOWN_CURRENT_FRONTIER_ONLY_NOT_FUTURE_YEAR_COMPLETED',
    durableInheritanceConfirmed:accepted.length>0 && accepted.every(a=>a.durable===true),
    frontierSummary:{uniqueTasks:frontier.tasks.length,duplicates:frontier.duplicateIds.length,frontierErrors:frontier.failures.length}});
}
