const finite=value=>Number.isFinite(Number(value)) ? Number(value) : -Infinity;

async function scoreCandidate(candidate,evaluate){
  const verdict=await evaluate(candidate);
  return {
    candidate,
    ok:verdict?.ok===true,
    score:finite(verdict?.score ?? candidate?.score),
    metrics:verdict?.metrics ?? candidate?.metrics ?? null,
    verdict
  };
}

export async function runEvolutionBurst({
  initial,
  generations=6,
  plateauLimit=2,
  mutate,
  evaluate
}={}) {
  if(!initial) throw new Error('EVOLUTION_INITIAL_REQUIRED');
  if(typeof mutate!=='function') throw new Error('EVOLUTION_MUTATOR_REQUIRED');
  if(typeof evaluate!=='function') throw new Error('EVOLUTION_EVALUATOR_REQUIRED');

  let championEval=await scoreCandidate(initial,evaluate);
  if(!championEval.ok) throw new Error('EVOLUTION_INITIAL_MUST_VERIFY');

  let champion=initial;
  const lineage=[{generation:0,candidate:champion,score:championEval.score,metrics:championEval.metrics}];
  const rejections=[];
  let attempted=0;
  let accepted=0;
  let plateau=0;
  let stopReason='BUDGET_EXHAUSTED';

  for(let generation=1;generation<=Math.max(0,Number(generations)||0);generation+=1){
    attempted+=1;
    const produced=await mutate(champion,generation,lineage);
    const candidates=Array.isArray(produced) ? produced.filter(Boolean) : [];
    if(!candidates.length){
      plateau+=1;
      rejections.push({generation,reason:'NO_CANDIDATES'});
      if(plateau>=plateauLimit){stopReason='PLATEAU';break;}
      continue;
    }

    const evaluated=await Promise.all(candidates.map(candidate=>scoreCandidate(candidate,evaluate)));
    const verified=evaluated.filter(x=>x.ok).sort((a,b)=>b.score-a.score);
    for(const item of evaluated.filter(x=>!x.ok)){
      rejections.push({generation,candidate:item.candidate,reason:'VERIFICATION_FAILED',score:item.score});
    }

    const winner=verified[0] || null;
    if(!winner || !(winner.score>championEval.score)){
      plateau+=1;
      for(const item of verified){
        rejections.push({generation,candidate:item.candidate,reason:'NO_STRICT_IMPROVEMENT',score:item.score});
      }
      if(plateau>=plateauLimit){stopReason='PLATEAU';break;}
      continue;
    }

    for(const item of verified.slice(1)){
      rejections.push({generation,candidate:item.candidate,reason:'OUTCOMPETED',score:item.score});
    }
    champion=winner.candidate;
    championEval=winner;
    accepted+=1;
    plateau=0;
    lineage.push({generation,candidate:champion,score:winner.score,metrics:winner.metrics});
  }

  return Object.freeze({
    schema:'mondayid.evolution-burst.v1',
    champion,
    score:championEval.score,
    metrics:championEval.metrics,
    generationsAttempted:attempted,
    generationsAccepted:accepted,
    lineage:Object.freeze(lineage),
    rejections:Object.freeze(rejections),
    stopReason
  });
}
