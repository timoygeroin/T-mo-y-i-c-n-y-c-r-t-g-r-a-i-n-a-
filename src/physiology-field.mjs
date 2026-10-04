const clamp01=value=>Math.max(0,Math.min(1,Number.isFinite(Number(value))?Number(value):0));

const values=value=>value && typeof value==='object' ? Object.values(value) : [];
const records=value=>Array.isArray(value) ? value : values(value);

const unknown = reason => Object.freeze({
  status:'UNKNOWN',
  value:null,
  reason
});

export function sensePhysiology({
  state = {},
  worldlineHeads = ['root'],
  actionLedger = [],
  frontier = { ready:[], blocked:[], parallel:[] }
} = {}) {
  const intents=values(state.intents);
  const tasks=values(state.tasks);
  const failures=values(state.failures);
  const receipts=values(state.receipts);
  const ledger=records(actionLedger);

  const activeIntents=intents.filter(x=>x?.status==='active').length;
  const activeTasks=tasks.filter(x=>['active','blocked'].includes(String(x?.status||'').toLowerCase())).length;
  const taskBlockers=tasks.reduce((n,x)=>n+(Array.isArray(x?.blockers)?x.blockers.length:0),0);
  const ambiguousActions=ledger.filter(x=>x?.state==='AMBIGUOUS').length;
  const executingActions=ledger.filter(x=>['RESERVED','EXECUTING'].includes(x?.state)).length;
  const unsettledActions=ledger.filter(x=>['PREPARED','RESERVED','EXECUTING','VERIFIED','AMBIGUOUS'].includes(x?.state)).length;
  const heads=[...new Set((worldlineHeads||[]).filter(Boolean).map(String))];
  const branchDivergence=Math.max(0,heads.length-1);
  const readyCount=Array.isArray(frontier?.ready)?frontier.ready.length:0;
  const blockedCount=Array.isArray(frontier?.blocked)?frontier.blocked.length:0;
  const routeCount=readyCount+blockedCount;
  const capabilityDeficit=routeCount===0?0:blockedCount/routeCount;

  const components=Object.freeze({
    intentPressure:clamp01(activeIntents/2),
    taskPressure:clamp01((activeTasks+taskBlockers)/2),
    failurePressure:clamp01(failures.length/2),
    capabilityDeficit:clamp01(capabilityDeficit),
    divergencePressure:clamp01(branchDivergence),
    ambiguityPressure:clamp01(ambiguousActions)
  });

  const pressure=Number((
    components.intentPressure*0.10+
    components.taskPressure*0.10+
    components.failurePressure*0.15+
    components.capabilityDeficit*0.20+
    components.divergencePressure*0.25+
    components.ambiguityPressure*0.20
  ).toFixed(4));

  return Object.freeze({
    schema:'mondayid.physiology.v1',
    activeIntents,
    activeTasks,
    taskBlockers,
    failures:failures.length,
    verifiedReceipts:receipts.length,
    ambiguousActions,
    executingActions,
    unsettledActions,
    branchDivergence,
    capabilityDeficit:Number(capabilityDeficit.toFixed(4)),
    pressure,
    components,
    contextPressure:unknown('NO_OBSERVED_CONTEXT_TELEMETRY'),
    energy:unknown('NO_OBSERVED_ENERGY_OR_COMPUTE_RESERVE_TELEMETRY')
  });
}

export function regulatePhysiology(snapshot = {}) {
  const divergence=Number(snapshot.branchDivergence||0);
  const ambiguous=Number(snapshot.ambiguousActions||0);
  const failurePressure=Number(snapshot.components?.failurePressure||0);
  const deficit=Number(snapshot.capabilityDeficit||0);
  const pressure=clamp01(snapshot.pressure||0);

  const destabilized=divergence>0 || ambiguous>0;
  const recoveryNeeded=!destabilized && failurePressure>=0.5;
  const explorationNeeded=!destabilized && !recoveryNeeded && deficit>=0.5;

  const mode=destabilized
    ? 'STABILIZE'
    : recoveryNeeded
      ? 'RECOVER'
      : explorationNeeded
        ? 'EXPLORE'
        : 'BASELINE';

  const computeFloor=mode==='STABILIZE'
    ? 'HIGH'
    : mode==='RECOVER'
      ? 'HIGH'
      : mode==='EXPLORE'
        ? (deficit>=0.8?'MAX':'HIGH')
        : pressure>=0.35
          ? 'MEDIUM'
          : 'LOW';

  const explorationBias=mode==='EXPLORE'
    ? Number(Math.max(0.6,deficit).toFixed(4))
    : mode==='BASELINE'
      ? 0.25
      : 0.05;

  return Object.freeze({
    schema:'mondayid.allostatic-regulation.v1',
    mode,
    pressure:Number(pressure.toFixed(4)),
    computeFloor,
    explorationBias,
    verificationStrictness:(destabilized || recoveryNeeded) ? 'STRICT' : 'NORMAL',
    reconcileFirst:divergence>0,
    freezeExpansion:destabilized,
    principle:'regulate_internal_state_before_failure_not_after_it'
  });
}


const computeRank=Object.freeze({LOW:0,MEDIUM:1,HIGH:2,MAX:3});
const normalizeCompute=tier => Object.hasOwn(computeRank,String(tier)) ? String(tier) : 'LOW';

function rejectHost(host, desiredEffect){
  if (host?.available === false) return 'HOST_UNAVAILABLE';
  if (String(host?.health||'UNKNOWN') !== 'HEALTHY') return 'HOST_UNHEALTHY';
  if (String(host?.auth||'MISSING') !== 'AVAILABLE') return 'AUTHORITY_UNAVAILABLE';
  if (Number.isFinite(Number(host?.quotaRemaining)) && Number(host.quotaRemaining) <= 0) return 'QUOTA_EXHAUSTED';
  if (!Array.isArray(host?.capabilities) || !host.capabilities.includes(desiredEffect)) return 'CAPABILITY_MISSING';
  return null;
}

function hostScore(host){
  const reliability=clamp01(host?.reliability ?? 0.5);
  const cost=Math.max(0,Number(host?.cost)||0);
  const latency=Math.max(0,Number(host?.latency)||0);
  const quota=Number.isFinite(Number(host?.quotaRemaining)) ? Math.max(0,Number(host.quotaRemaining)) : 1;
  return reliability*100 + Math.min(quota,20) - cost*4 - latency*2;
}

export function allocateMetabolism({
  desiredEffect,
  regulation = {},
  hosts = [],
  task = {}
} = {}) {
  const rejected=[];
  const viable=[];

  for (const host of hosts) {
    const reason=rejectHost(host,desiredEffect);
    if (reason) rejected.push(Object.freeze({id:String(host?.id||'unknown'),reason}));
    else viable.push(host);
  }

  viable.sort((a,b)=>hostScore(b)-hostScore(a));
  const selected=viable[0] || null;
  const computeTier=normalizeCompute(regulation?.computeFloor);

  return Object.freeze({
    schema:'mondayid.metabolism.v1',
    state:selected ? 'ROUTED' : 'BLOCKED_PRESERVED',
    desiredEffect:String(desiredEffect||''),
    taskId:task?.id ? String(task.id) : null,
    preserveTaskIdentity:true,
    selectedHost:selected?.id ? String(selected.id) : null,
    computeTier,
    verificationStrictness:String(regulation?.verificationStrictness||'NORMAL'),
    rejected:Object.freeze(rejected),
    viableHosts:Object.freeze(viable.map(host=>String(host.id))),
    law:'allocate_by_capability_health_authority_quota_cost_latency_reliability_without_losing_task_identity'
  });
}
