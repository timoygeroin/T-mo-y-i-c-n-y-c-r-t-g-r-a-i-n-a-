const DOMAIN_HINTS = {
  vision: /vision|image|generator|render|visual/i,
  host: /host|vercel|runtime|computer|iphone|ios|web/i,
  research: /research|quantum|qml|paper|study/i,
  continuity: /chat|memory|worldline|continuity|history/i,
  code: /github|code|branch|commit|repo/i
};

function domainOf(text='') {
  const hits = Object.entries(DOMAIN_HINTS).filter(([,rx]) => rx.test(text)).map(([k]) => k);
  return hits.length ? hits : ['general'];
}

export function compileSignals(signals = []) {
  const nodes = [];
  for (const signal of signals) {
    const text = String(signal.text ?? signal.intent ?? '');
    const domains = signal.domains || domainOf(text);
    const rootId = signal.id || `signal:${nodes.length}`;
    nodes.push({
      id: rootId,
      type: 'signal',
      text,
      domains,
      source: signal.source || 'human',
      priority: signal.priority ?? 50,
      status: 'observed',
      dependsOn: []
    });
    for (const domain of domains) {
      nodes.push({
        id: `${rootId}:${domain}`,
        type: 'objective',
        domain,
        text,
        sourceSignal: rootId,
        priority: signal.priority ?? 50,
        status: 'ready',
        dependsOn: [rootId],
        effect: signal.effect || text
      });
    }
  }
  return { schema: 'mondayid.intent-graph.v2', nodes };
}
