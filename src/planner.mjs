const score = (n) => (n.priority ?? 0) + (n.blockingOthers ? 30 : 0) + (n.verifiable ? 10 : 0) - (n.cost ?? 0);

export function buildFrontier(graph, capabilities = {}) {
  const objectives = graph.nodes.filter(n => n.type === 'objective');
  const actions = objectives.map(o => {
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
      cost: receptor?.cost ?? 0
    };

    const executable = Boolean(receptor?.execute);
    const verifiable = Boolean(receptor?.verify);
    let supported = executable && verifiable;
    if (supported && typeof receptor?.supports === 'function') {
      try {
        supported = receptor.supports(candidate) === true;
      } catch {
        supported = false;
      }
    }

    const ready = executable && verifiable && supported;
    const blocker = !executable
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

  const ready = actions.filter(a => a.executable).sort((a,b) => score(b) - score(a));
  const blocked = actions.filter(a => !a.executable);
  return {
    ready,
    blocked,
    parallel: ready.filter((a, i, arr) => arr.findIndex(x => x.domain === a.domain) === i)
  };
}
