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
