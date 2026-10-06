import { rankDecisionRoutes } from './decision-field.mjs';

const arr=value=>Array.isArray(value)?value:[];
const first=value=>arr(value)[0] || null;

function result(state,action=null,{notifyUser=false,requiresHuman=false,candidates=[]}={}){
  return Object.freeze({
    ok:true,
    schema:'mondayid.autopoiesis-pass.v1',
    state,
    action:action?Object.freeze(action):null,
    notifyUser,
    requiresHuman,
    candidates:Object.freeze(candidates)
  });
}

export function compileAutopoiesisPass({
  signal = {},
  system = {},
  runtime = {}
} = {}) {
  if (system?.root_objective?.scope !== 'WORLDLINE_NOT_TURN') {
    return Object.freeze({
      ok:false,
      schema:'mondayid.autopoiesis-pass.v1',
      state:'UNRESOLVED',
      code:'PERSISTENT_ROOT_OBJECTIVE_REQUIRED',
      action:null,
      notifyUser:true,
      requiresHuman:true,
      candidates:Object.freeze([])
    });
  }

  const openTasks=arr(runtime.openTasks);
  const capabilityGaps=arr(runtime.capabilityGaps);
  const routeFailures=arr(runtime.routeFailures);
  const alternateRoutes=arr(runtime.alternateRoutes);
  const humanGates=arr(runtime.humanGates);
  const candidates=[];

  if (signal?.repeatedCorrection === true) {
    candidates.push({
      id:'repair-transfer',
      kind:'REPAIR_REGRESSION',
      reason:'FAILED_TRANSFER',
      exactObjectMatch:1,
      desiredEffectFidelity:1,
      truth:1,
      worldlineProgress:1,
      futureCorrectionsEliminated:1,
      userOrchestrationReduction:1,
      transferValue:1,
      systemImprovement:1,
      reversibility:1,
      risk:0.05,
      cost:0.1
    });
  }

  const quotaFailure=routeFailures.find(item=>String(item?.code||'').toUpperCase()==='QUOTA_EXHAUSTED');
  if (quotaFailure && openTasks.length && alternateRoutes.length) {
    candidates.push({
      id:'reroute-preserve-task',
      kind:'REROUTE_PRESERVE_TASK',
      taskId:String(openTasks[0].id),
      failedRoute:quotaFailure.route || null,
      route:String(alternateRoutes[0]),
      exactObjectMatch:1,
      desiredEffectFidelity:1,
      truth:1,
      worldlineProgress:0.85,
      futureCorrectionsEliminated:0.8,
      userOrchestrationReduction:1,
      transferValue:0.8,
      systemImprovement:0.7,
      reversibility:1,
      risk:0.05,
      cost:0.1
    });
  }

  const gap=capabilityGaps.find(item=>item?.requiresHuman !== true && item?.reversible !== false);
  if (gap) {
    candidates.push({
      id:`evolve:${gap.id || 'gap'}`,
      kind:'EVOLVE_CAPABILITY',
      gapId:String(gap.id || 'gap'),
      exactObjectMatch:0.95,
      desiredEffectFidelity:1,
      truth:1,
      worldlineProgress:1,
      futureCorrectionsEliminated:0.95,
      userOrchestrationReduction:1,
      transferValue:1,
      systemImprovement:1,
      reversibility:1,
      risk:0.1,
      cost:0.2
    });
  }

  if (openTasks.length && !quotaFailure && !gap) {
    candidates.push({
      id:`resume:${openTasks[0].id}`,
      kind:'RESUME_DURABLE_TASK',
      taskId:String(openTasks[0].id),
      exactObjectMatch:1,
      desiredEffectFidelity:1,
      truth:1,
      worldlineProgress:0.75,
      futureCorrectionsEliminated:0.5,
      userOrchestrationReduction:0.9,
      transferValue:0.7,
      systemImprovement:0.4,
      reversibility:1,
      risk:0.05,
      cost:0.1
    });
  }

  if (candidates.length) {
    const ranked=rankDecisionRoutes(candidates);
    const winner=ranked.find(item=>item.decision.admissible);
    if (winner) {
      const action={...winner.route};
      for (const key of ['exactObjectMatch','desiredEffectFidelity','truth','worldlineProgress','futureCorrectionsEliminated','userOrchestrationReduction','transferValue','systemImprovement','reversibility','risk','cost']) delete action[key];
      return result('ACT',action,{notifyUser:false,requiresHuman:false,candidates:ranked.map(item=>({id:item.route.id,score:item.decision.score}))});
    }
  }

  const gate=first(humanGates);
  if (gate) {
    return result('HUMAN_GATE',{
      kind:'REQUEST_HUMAN_GATE',
      gateId:String(gate.id || 'gate'),
      gateType:String(gate.type || 'AUTHORITY'),
      effect:String(gate.effect || '')
    },{notifyUser:true,requiresHuman:true});
  }

  return result('IDLE',null,{notifyUser:false,requiresHuman:false});
}
