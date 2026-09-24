import { frameSignal } from './semantic-frame.mjs';
import { compileAttractorContract } from './attractor-field.mjs';

const DOMAIN_HINTS = {
  vision: /vision|image|generator|render|visual/i,
  host: /host|vercel|runtime|computer|iphone|ios|web/i,
  research: /research|quantum|qml|paper|study/i,
  continuity: /chat|memory|worldline|continuity|history/i,
  code: /github|code|branch|commit|repo/i
};

export function inferDomains(text='') {
  const hits = Object.entries(DOMAIN_HINTS).filter(([,rx]) => rx.test(text)).map(([k]) => k);
  return hits.length ? hits : ['general'];
}

export function compileSignals(signals = [], { state = {}, policies = {} } = {}) {
  const nodes = [];
  for (const signal of signals) {
    const text = String(signal.text ?? signal.intent ?? '');
    const domains = signal.domains || inferDomains(text);
    const completedDomains = Array.isArray(signal.completedDomains) ? signal.completedDomains : [];
    const semanticFrame = frameSignal(signal);
    const attractorContract = compileAttractorContract(signal, { domains, state, policies });
    const rootId = signal.id || `signal:${nodes.length}`;
    nodes.push({
      id: rootId,
      type: 'signal',
      text,
      domains,
      completedDomains,
      source: signal.source || 'human',
      priority: signal.priority ?? 50,
      status: signal.status || 'active',
      semanticFrame,
      attractorContract,
      dependsOn: []
    });
    for (const domain of domains) {
      if (completedDomains.includes(domain)) continue;
      const routeCandidates=(signal.routeCandidates || []).filter(route => !route?.domain || route.domain === domain);
      nodes.push({
        id: `${rootId}:${domain}`,
        type: 'objective',
        domain,
        text,
        sourceSignal: rootId,
        priority: signal.priority ?? 50,
        status: 'ready',
        semanticFrame,
        attractorContract,
        routeCandidates,
        dependsOn: [rootId],
        effect: signal.effect || signal.desiredEffect || text
      });
    }
  }
  return { schema: 'mondayid.intent-graph.v4', nodes };
}
