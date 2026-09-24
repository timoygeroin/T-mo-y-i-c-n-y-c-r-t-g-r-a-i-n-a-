const unique = values => [...new Set((values || []).filter(Boolean).map(String))];

function taskId(intentId) {
  return `task:${intentId}`;
}

export function taskFromIntent(intent = {}, prior = null) {
  const base = prior || {};
  return {
    schema:'mondayid.task.v1',
    taskId:taskId(intent.id),
    intentId:intent.id,
    goal:String(intent.text || intent.effect || ''),
    exactObject:intent.exactObject || base.exactObject || null,
    desiredEffect:intent.desiredEffect || intent.effect || base.desiredEffect || null,
    status:intent.status === 'fulfilled' ? 'COMPLETED' : (base.status || 'RUNNING'),
    evidence:unique(base.evidence),
    actionsCompleted:unique(base.actionsCompleted),
    receipts:unique(base.receipts),
    blockers:unique(base.blockers),
    openRemainder:(intent.obligations || [])
      .filter(item => item.material !== false && item.status === 'OPEN')
      .map(item => item.id),
    nextAdmissibleAction:base.nextAdmissibleAction || null,
    continuationCursor:{
      completedDomains:[...(intent.completedDomains || [])],
      remainingDomains:(intent.domains || []).filter(domain => !(intent.completedDomains || []).includes(domain))
    },
    terminalCondition:'ALL_MATERIAL_OBLIGATIONS_CLOSED_AND_DESIRED_EFFECT_VERIFIED'
  };
}

export function ensureTasks(worldline, intents = []) {
  let rev=worldline.revision();
  const state=worldline.materialize();
  const created=[];

  for(const intent of intents){
    const id=taskId(intent.id);
    if(state.tasks?.[id]) continue;
    const task=taskFromIntent(intent);
    const out=worldline.append({
      kind:'task',
      subject:id,
      payload:task,
      epistemic:'observed'
    },rev);
    if(!out.ok) return out;
    rev=out.revision;
    created.push(task);
  }

  return {ok:true,revision:rev,created};
}

export function updateTasks(worldline,{graph,frontier,results=[]}={}) {
  let rev=worldline.revision();
  const state=worldline.materialize();
  const updated=[];

  for(const intent of Object.values(state.intents || {})){
    const id=taskId(intent.id);
    const prior=state.tasks?.[id] || taskFromIntent(intent);
    const ownResults=results.filter(result => result.action?.sourceSignal === intent.id);
    const verified=ownResults.filter(result => result.ok);
    const failed=ownResults.filter(result => !result.ok);
    const blocked=(frontier?.blocked || []).filter(item => item.sourceSignal === intent.id);

    const task=taskFromIntent(intent,prior);
    task.actionsCompleted=unique([
      ...task.actionsCompleted,
      ...verified.map(result => result.action?.id)
    ]);
    task.receipts=unique([
      ...task.receipts,
      ...verified.map(result => result.action?.id ? `receipt:${result.action.id}` : null)
    ]);
    task.evidence=unique([
      ...task.evidence,
      ...verified.flatMap(result => [
        result.verification?.mode,
        result.result?.evidence?.responseId,
        result.result?.evidence?.provider
      ])
    ]);
    task.blockers=unique([
      ...blocked.map(item => item.blocker),
      ...failed.map(result => result.verification?.code || result.error || 'ACTION_FAILED')
    ]);

    if(intent.status === 'fulfilled'){
      task.status='COMPLETED';
      task.blockers=[];
      task.openRemainder=[];
      task.nextAdmissibleAction=null;
    } else if(blocked.length){
      task.status='BLOCKED';
      task.nextAdmissibleAction=blocked[0]?.blocker || null;
    } else if(failed.length){
      task.status='BLOCKED';
      task.nextAdmissibleAction=failed[0]?.verification?.code || failed[0]?.error || 'RETRY_AFTER_REPAIR';
    } else {
      task.status='RUNNING';
      const nextObjective=graph?.nodes?.find(node =>
        node.type === 'objective' &&
        node.sourceSignal === intent.id &&
        !(intent.completedDomains || []).includes(node.domain)
      );
      task.nextAdmissibleAction=nextObjective?.id || null;
    }

    const changed=JSON.stringify(task) !== JSON.stringify(prior);
    if(!changed) continue;

    const out=worldline.append({
      kind:'task',
      subject:id,
      payload:task,
      evidence:task.receipts,
      epistemic:task.status === 'COMPLETED' ? 'verified' : 'observed'
    },rev);
    if(!out.ok) return out;
    rev=out.revision;
    updated.push(task);
  }

  return {ok:true,revision:rev,updated};
}

export function activeTasks(worldline){
  const state=worldline.materialize();
  return Object.values(state.tasks || {}).filter(task => task?.status !== 'COMPLETED');
}
