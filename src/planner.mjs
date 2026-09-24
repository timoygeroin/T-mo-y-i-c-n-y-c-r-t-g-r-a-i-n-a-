import { rankDecisionRoutes } from './decision-field.mjs';

const score = (n) => {
  const computePressure = Number(n.inferenceContract?.compute?.score || 0);
  return (n.priority ?? 0)
    + (n.blockingOthers ? 30 : 0)
    + (n.verifiable ? 10 : 0)
    + Math.round(computePressure * 10)
    - (n.cost ?? 0);
};

export function buildFrontier(graph, capabilities = {}) {
  const objectives = graph.nodes.filter(n => n.type === 'objective');
  const expandedObjectives = objectives.flatMap(o => {
    if (!Array.isArray(o.routeCandidates) || o.routeCandidates.length === 0) {
      return [{...o, routeCandidate:null, routeDecision:null}];
    }
    const ranked=rankDecisionRoutes(o.routeCandidates);
    return ranked.map(({route,decision})=>({
      ...o,
      routeCandidate:route,
      routeDecision:decision,
      effect:route.effect || o.effect,
      cost:Number.isFinite(Number(route.cost)) ? Number(route.cost) : o.cost
    }));
  });

  const actions = expandedObjectives.map(o => {
    const receptor = capabilities[o.domain] || capabilities.general;
    const candidate = {
      id: `action:${o.id}`,
      objectiveId: o.id,
      sourceSignal: o.sourceSignal,
      domain: o.domain,
      effect: o.effect,
      receptor: receptor?.name || null,
      priority: o.priority,
      verifiable: Boolean(receptor?.verify),
      cost: Number.isFinite(Number(o.cost)) ? Number(o.cost) : (receptor?.cost ?? 0),
      inferenceContract: o.attractorContract || null,
      routeCandidate: o.routeCandidate || null,
      routeDecision: o.routeDecision || null
    };

    const executable = Boolean(receptor?.execute);
    const verifiable = Boolean(receptor?.verify);
    const lineageBlocked = Boolean(
      candidate.inferenceContract?.lineage && (
        candidate.inferenceContract.lineage.genome?.state !== 'ACTIVE' ||
        candidate.inferenceContract.lineage.move?.ok === false
      )
    );
    const routeBlocked = Boolean(candidate.routeDecision && candidate.routeDecision.admissible === false);
    let supported = executable && verifiable && !lineageBlocked && !routeBlocked;
    if (supported && typeof receptor?.supports === 'function') {
      try {
        supported = receptor.supports(candidate) === true;
      } catch {
        supported = false;
      }
    }

    const ready = executable && verifiable && supported && !lineageBlocked && !routeBlocked;
    const blocker = routeBlocked
      ? `ROUTE_HARD_VETO:${o.domain}:${candidate.routeDecision.hardVetoes.join(',')}`
      : lineageBlocked
      ? `LINEAGE_CONTRACT_BLOCKED:${o.domain}`
      : !executable
        ? `NO_RECEPTOR:${o.domain}`
        : !verifiable
          ? `NO_VERIFIER:${o.domain}`
          : !supported
            ? `UNSUPPORTED_EFFECT:${o.domain}`
            : null;

    return {
      ...candidate,
      executable: ready,
      status: ready ? 'ready' : 'blocked',
      blocker
    };
  });

  const ready = actions.filter(a => a.executable).sort((a,b) => {
    const aDecision=a.routeDecision?.score ?? -Infinity;
    const bDecision=b.routeDecision?.score ?? -Infinity;
    if (aDecision !== bDecision) return bDecision - aDecision;
    return score(b) - score(a);
  });
  const blocked = actions.filter(a => !a.executable);
  return {
    ready,
    blocked,
    parallel: ready.filter((a, i, arr) => arr.findIndex(x => x.domain === a.domain) === i)
  };
}
