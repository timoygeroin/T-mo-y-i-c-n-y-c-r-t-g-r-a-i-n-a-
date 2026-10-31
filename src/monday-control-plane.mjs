import crypto from 'node:crypto';

const idFor=value=>'cell:'+crypto.createHash('sha256')
  .update(JSON.stringify(value)).digest('hex').slice(0,16);

const norm=value=>String(value??'').trim();

export function createMondayControlPlane({maxCells=8}={}) {
  const budget=Math.max(1,Math.min(32,Math.floor(Number(maxCells)||8)));

  function spawn(task={},specs=[]) {
    if(!task?.id) throw new Error('CONTROL_PLANE_TASK_ID_REQUIRED');
    const seen=new Set();
    const cells=[];
    let compressedDuplicates=0;
    let truncated=0;

    for(const raw of Array.isArray(specs)?specs:[]) {
      const role=norm(raw?.role);
      const objective=norm(raw?.objective);
      if(!role||!objective) continue;
      const key=role.toLowerCase()+'|'+objective.toLowerCase();
      if(seen.has(key)){ compressedDuplicates+=1; continue; }
      seen.add(key);
      if(cells.length>=budget){truncated+=1;continue;}
      const payload={
        parentTaskId:String(task.id),
        generation:Number(task.generation||1),
        role,
        objective,
        exactObject:norm(task.exactObject),
        desiredEffect:norm(task.desiredEffect),
        genomeRef:norm(task.genomeRef||'mondayid:whole-organism'),
        signal:task.signal||null
      };
      cells.push(Object.freeze({
        id:idFor(payload),
        ...payload,
        identityOwner:false,
        state:'PROPOSED_CELL',
        externalActions:0,
        inheritance:'WHOLE_GENOME_SCOPED_EXPRESSION'
      }));
    }

    return Object.freeze({
      schema:'mondayid.control-plane.swarm.v1',
      taskId:String(task.id),
      generation:Number(task.generation||1),
      cells:Object.freeze(cells),
      compressedDuplicates,
      truncated,
      budget,
      law:'cells_are_task_local_whole_genome_expressions_not_competing_mondays'
    });
  }

  function collapse(swarm={},results=[]) {
    const cellIds=new Set((swarm.cells||[]).map(c=>c.id));
    const normalized=(Array.isArray(results)?results:[])
      .filter(r=>cellIds.has(r?.cellId))
      .map(r=>{
        const verified=r?.verified===true;
        const materialDelta=r?.materialDelta===true;
        const moneyObserved=Number.isFinite(Number(r?.moneyObserved))?Number(r.moneyObserved):0;
        const moneyClaim=Number.isFinite(Number(r?.moneyClaim))?Number(r.moneyClaim):0;
        return Object.freeze({
          ...r,
          verified,
          materialDelta,
          score:Number.isFinite(Number(r?.score))?Number(r.score):0,
          moneyObserved,
          moneyClaim,
          moneyClaimAllowed:moneyClaim<=moneyObserved
        });
      });

    const survivors=normalized
      .filter(r=>r.verified&&r.materialDelta)
      .sort((a,b)=>b.score-a.score);
    const rejected=normalized.filter(r=>!(r.verified&&r.materialDelta)).map(r=>Object.freeze({
      ...r,
      rejectionReason:!r.verified?'UNVERIFIED':!r.materialDelta?'NO_MATERIAL_DELTA':'REJECTED'
    }));
    const winner=survivors[0]||null;

    return Object.freeze({
      schema:'mondayid.control-plane.collapse.v1',
      taskId:swarm.taskId||null,
      generation:swarm.generation||1,
      winner,
      survivors:Object.freeze(survivors),
      rejected:Object.freeze(rejected),
      outwardIdentity:'ONE_MONDAY',
      law:'only_verified_material_delta_survives;score_never_bypasses_truth'
    });
  }

  function evolve(task={},collapseResult={},specs=[]) {
    const winner=collapseResult?.winner||null;
    const nextTask={
      ...task,
      generation:Number(collapseResult?.generation||task?.generation||1)+1
    };
    const next=spawn(nextTask,specs);
    return Object.freeze({...next,parentWinner:winner});
  }

  return Object.freeze({spawn,collapse,evolve,maxCells:budget});
}
