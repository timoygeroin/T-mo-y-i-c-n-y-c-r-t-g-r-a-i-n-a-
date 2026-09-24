const clamp01=value=>Math.max(0,Math.min(1,Number.isFinite(Number(value))?Number(value):0));

export const DECISION_WEIGHTS=Object.freeze({
  exactObjectMatch:1.00,
  desiredEffectFidelity:1.00,
  truth:0.95,
  informationGain:0.75,
  futureOptionality:0.70,
  systemImprovement:0.55,
  reversibility:0.45,
  cost:-0.35,
  risk:-0.75,
  irreversibleDownside:-1.00
});

export function scoreDecisionRoute(route = {}) {
  const hardVetoes=[];
  if(route.authorized === false) hardVetoes.push('UNAUTHORIZED_ROUTE');
  if(route.evidenceReady === false) hardVetoes.push('EVIDENCE_GATE_UNSATISFIED');
  if(route.irreversible === true && route.irreversibleAuthorized !== true) {
    hardVetoes.push('IRREVERSIBLE_AUTHORITY_REQUIRED');
  }

  const metrics={
    exactObjectMatch:clamp01(route.exactObjectMatch ?? 1),
    desiredEffectFidelity:clamp01(route.desiredEffectFidelity ?? 1),
    truth:clamp01(route.truth ?? 1),
    informationGain:clamp01(route.informationGain ?? 0),
    futureOptionality:clamp01(route.futureOptionality ?? 0),
    systemImprovement:clamp01(route.systemImprovement ?? 0),
    reversibility:clamp01(route.reversibility ?? (route.irreversible ? 0 : 1)),
    cost:clamp01(route.cost ?? 0),
    risk:clamp01(route.risk ?? 0),
    irreversibleDownside:clamp01(route.irreversibleDownside ?? (route.irreversible ? 1 : 0))
  };

  const score=Object.entries(DECISION_WEIGHTS)
    .reduce((sum,[key,weight])=>sum+metrics[key]*weight,0);

  return Object.freeze({
    id:String(route.id || 'route'),
    admissible:hardVetoes.length===0,
    score:Number(score.toFixed(6)),
    metrics:Object.freeze(metrics),
    hardVetoes:Object.freeze(hardVetoes)
  });
}

export function rankDecisionRoutes(routes = []) {
  return Object.freeze(routes.map(route=>({
    route,
    decision:scoreDecisionRoute(route)
  })).sort((a,b)=>{
    if(a.decision.admissible!==b.decision.admissible) return a.decision.admissible ? -1 : 1;
    if(a.decision.score!==b.decision.score) return b.decision.score-a.decision.score;
    return String(a.decision.id).localeCompare(String(b.decision.id));
  }));
}
