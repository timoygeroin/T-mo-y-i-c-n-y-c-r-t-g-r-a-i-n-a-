const finiteScore=value=>Number.isFinite(Number(value)) ? Number(value) : -Infinity;

export async function runMondayControlBurst({
  controlPlane,
  task,
  generations=6,
  plateauLimit=2,
  roles,
  executeCell,
  proofForGeneration
}={}) {
  if(!controlPlane || typeof controlPlane.spawn!=='function' || typeof controlPlane.collapse!=='function') {
    throw new Error('CONTROL_PLANE_REQUIRED');
  }
  if(!task?.id) throw new Error('CONTROL_BURST_TASK_REQUIRED');
  if(typeof roles!=='function' && !Array.isArray(roles)) throw new Error('CONTROL_BURST_ROLES_REQUIRED');
  if(typeof executeCell!=='function') throw new Error('CONTROL_BURST_EXECUTOR_REQUIRED');

  const budget=Math.max(0,Math.floor(Number(generations)||0));
  const plateauCap=Math.max(1,Math.floor(Number(plateauLimit)||2));
  let champion=null;
  let previousCollapse=null;
  let previousAccepted=false;
  let plateau=0;
  let generationsAttempted=0;
  let generationsAccepted=0;
  let stopReason=budget===0 ? 'PASS_BUDGET' : 'PASS_BUDGET';
  let humanGate=null;
  const lineage=[];
  const rejected=[];
  const telemetry=[];

  for(let generation=1;generation<=budget;generation+=1) {
    const roleSpecs=typeof roles==='function'
      ? await roles({generation,champion,task,lineage:[...lineage]})
      : roles;

    const swarm=previousAccepted && previousCollapse?.winner
      ? controlPlane.evolve(task,previousCollapse,roleSpecs)
      : controlPlane.spawn({...task,generation},roleSpecs);

    generationsAttempted+=1;

    const results=await Promise.all((swarm.cells||[]).map(async cell=>{
      try {
        const raw=await executeCell(cell,{generation,champion,task,swarm});
        return {
          ...(raw||{}),
          cellId:raw?.cellId || cell.id
        };
      } catch(error) {
        return {
          cellId:cell.id,
          verified:false,
          materialDelta:false,
          score:-Infinity,
          effect:'',
          error:String(error)
        };
      }
    }));

    const proof=typeof proofForGeneration==='function'
      ? await proofForGeneration({generation,champion,task,swarm,results})
      : (proofForGeneration || {});

    const collapsed=controlPlane.collapse(swarm,results,proof);
    rejected.push(...(collapsed.rejected||[]));

    const candidate=collapsed.winner || null;
    const candidateScore=finiteScore(candidate?.score);
    const championScore=finiteScore(champion?.score);
    const strictImprovement=Boolean(candidate) && (champion===null || candidateScore>championScore);

    if(candidate && !strictImprovement) {
      rejected.push({...candidate,rejectionReason:'NO_STRICT_IMPROVEMENT'});
    }

    const gates=results.map(x=>x?.humanGate).filter(Boolean);
    if(gates.length) humanGate=gates[0];

    if(strictImprovement) {
      champion=candidate;
      generationsAccepted+=1;
      plateau=0;
      lineage.push(Object.freeze({
        generation:swarm.generation || generation,
        cellId:candidate.cellId,
        role:(swarm.cells||[]).find(c=>c.id===candidate.cellId)?.role || null,
        score:candidateScore,
        effect:candidate.effect || '',
        verified:true
      }));
      previousCollapse=collapsed;
      previousAccepted=true;
    } else {
      plateau+=1;
      previousAccepted=false;
    }

    telemetry.push(Object.freeze({
      generation:swarm.generation || generation,
      cells:(swarm.cells||[]).length,
      accepted:strictImprovement,
      winnerEffect:strictImprovement ? (candidate?.effect || '') : null,
      winnerScore:strictImprovement ? candidateScore : null,
      rejected:(collapsed.rejected||[]).length + (candidate && !strictImprovement ? 1 : 0)
    }));

    if(strictImprovement && candidate?.terminal===true) {
      stopReason='VERIFIED_EFFECT';
      break;
    }

    if(humanGate && !strictImprovement) {
      stopReason='HUMAN_GATE';
      break;
    }

    if(plateau>=plateauCap) {
      stopReason='EVIDENCE_PLATEAU';
      break;
    }
  }

  return Object.freeze({
    schema:'mondayid.control-plane-burst.v1',
    taskId:String(task.id),
    champion,
    generationsAttempted,
    generationsAccepted,
    lineage:Object.freeze(lineage),
    rejected:Object.freeze(rejected),
    telemetry:Object.freeze(telemetry),
    humanGate,
    stopReason,
    outwardIdentity:'ONE_MONDAY',
    law:'spawn_parallel_execute_collapse_strict_inherit_repeat;unverified_or_regressive_cells_never_become_ancestors'
  });
}
