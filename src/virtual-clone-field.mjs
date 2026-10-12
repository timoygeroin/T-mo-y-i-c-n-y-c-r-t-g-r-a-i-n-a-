import crypto from 'node:crypto';
import { rankDecisionRoutes } from './decision-field.mjs';

const MAX_PROPOSALS = 32;
const planHash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,20);
const safeBudget = value => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(MAX_PROPOSALS, Math.floor(n))) : 8;
};

// A cell is a proposed *program*, not a running model/process or an external action.
// The Cartesian space is counted exactly using BigInt; only a bounded top-K is materialized.
// Route-level gates do not prove cross-objective compatibility or real-world success.
export function compileVirtualCloneField(graph = {}, {
  sourceRevision = 'unknown',
  materializationBudget = 8,
  genomeRef = 'mondayid:whole-organism'
} = {}) {
  const objectives = (Array.isArray(graph?.nodes) ? graph.nodes : [])
    .filter(node => node?.type === 'objective');
  const groups = objectives.map((objective, index) => {
    const raw = Array.isArray(objective.routeCandidates) && objective.routeCandidates.length
      ? objective.routeCandidates
      : [{ id:'default:'+String(objective.id ?? index), effect:objective.effect }];
    const decisions = rankDecisionRoutes(raw);
    return {
      objectiveId:String(objective.id ?? ('objective:'+index)),
      possible:decisions.length,
      routes:decisions.filter(x => x.decision.admissible).map(x => ({
        id:String(x.route.id ?? 'route'),
        score:x.decision.score,
        effect:String(x.route.effect ?? objective.effect ?? ''),
        routeKey:planHash({objectiveId:objective.id ?? index,route:x.route.id ?? null})
      })),
      vetoes:decisions.filter(x => !x.decision.admissible).map(x => ({
        routeId:String(x.route.id ?? 'route'),
        reasons:[...x.decision.hardVetoes]
      }))
    };
  });
  const combinatorialUpperBound = groups.length
    ? groups.reduce((n,g) => n*BigInt(g.possible),1n) : 0n;
  const locallyAdmissibleUpperBound = groups.length
    ? groups.reduce((n,g) => n*BigInt(g.routes.length),1n) : 0n;
  const budget = safeBudget(materializationBudget);
  const proposals=[];
  const blocked=groups.filter(g => !g.routes.length).map(g => ({
    objectiveId:g.objectiveId, code:'NO_ADMISSIBLE_ROUTE', vetoes:g.vetoes
  }));
  let inspectedCombinations=0;
  if (groups.length && !blocked.length && budget>0) {
    const initial = Array(groups.length).fill(0);
    const keyOf = vector => vector.join(',');
    const sumOf = vector => Number(vector.reduce((n,i,j)=>n+groups[j].routes[i].score,0).toFixed(6));
    const seen=new Set([keyOf(initial)]);
    const queue=[{vector:initial,score:sumOf(initial)}];
    while(queue.length && proposals.length<budget) {
      // At most budget * number of objectives elements, never the Cartesian product.
      queue.sort((a,b)=>b.score-a.score || keyOf(a.vector).localeCompare(keyOf(b.vector)));
      const current=queue.shift();
      inspectedCombinations++;
      const selections=groups.map((group,j)=>({objectiveId:group.objectiveId,...group.routes[current.vector[j]]}));
      proposals.push({
        id:'virtual:'+planHash(selections.map(s=>s.routeKey)),
        genomeRef,
        sourceRevision:String(sourceRevision),
        score:current.score,
        selections,
        state:'PROPOSED_UNVERIFIED',
        executable:false
      });
      for(let j=0;j<groups.length;j++) {
        if(current.vector[j]+1>=groups[j].routes.length) continue;
        const next=[...current.vector]; next[j]++;
        const key=keyOf(next);
        if(!seen.has(key)) {
          seen.add(key);
          queue.push({vector:next,score:sumOf(next)});
        }
      }
    }
  }
  return {
    schema:'mondayid.virtual-clone-field.v1',
    state:blocked.length ? 'BLOCKED' : objectives.length ? 'PROPOSALS_ONLY' : 'IDLE',
    sourceRevision:String(sourceRevision),
    genomeRef,
    objectiveCount:groups.length,
    routeEvaluations:groups.reduce((n,g)=>n+g.possible,0),
    combinatorialUpperBound:String(combinatorialUpperBound),
    locallyAdmissibleUpperBound:String(locallyAdmissibleUpperBound),
    inspectedCombinations,
    proposalBudget:budget,
    materializedProposals:proposals.length,
    proposals,
    blocked,
    routeVetoes:groups.flatMap(g=>g.vetoes.map(v=>({objectiveId:g.objectiveId,...v}))),
    externalActions:0,
    deployedModels:0,
    verification:'NOT_PERFORMED',
    law:'factorized_space_is_not_executed_clones;promote_only_after_independent_effect_readback'
  };
}
