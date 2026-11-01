import { frameSignal, selectInvariantEffect } from './semantic-frame.mjs';
import { compileAttractorContract } from './attractor-field.mjs';
import { amplifyTaskSignal } from './task-amplifier.mjs';

const DOMAIN_HINTS = {
  vision: /vision|image|generator|render|visual|фото|изображен|визуал|генерац|ракурс|одежд/iu,
  host: /host|vercel|runtime|computer|iphone|ios|web|хост|сайт|айфон|приложен|компьютер/iu,
  research: /research|quantum|qml|paper|study|исследован|анализ|научн/iu,
  continuity: /chat|memory|worldline|continuity|history|чат|диалог|памят|синхрон|истори/iu,
  code: /github|code|branch|commit|repo|гитхаб|репозитори|код|ветк|коммит/iu
};

export function inferDomains(text='') {
  const hits = Object.entries(DOMAIN_HINTS).filter(([,rx]) => rx.test(text)).map(([k]) => k);
  return hits.length ? hits : ['general'];
}

export function compileSignals(signals = [], { state = {}, policies = {} } = {}) {
  const nodes = [];
  for (const received of signals) {
    const signal=amplifyTaskSignal(received);
    const text = String(signal.text ?? signal.intent ?? '');
    const selectedEffect=selectInvariantEffect(signal);
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
      amplification:signal.amplification || null,
      requireDomainReceptor:signal.requireDomainReceptor===true,
      dependsOn: []
    });
    for (const domain of domains) {
      const boundObligations=(signal.obligations || []).filter(item =>
        item.binding === 'obligation' && item.domain === domain);
      const openObligations=boundObligations.filter(item => item.status === 'OPEN');
      if (boundObligations.length && !openObligations.length) continue;
      if (!boundObligations.length && completedDomains.includes(domain)) continue;
      const routeCandidates=(signal.routeCandidates || []).filter(route => !route?.domain || route.domain === domain);
      for (const obligation of openObligations.length ? openObligations : [null]) {
        nodes.push({
          id: obligation ? `${rootId}:${domain}:obligation:${obligation.id}` : `${rootId}:${domain}`,
          type: 'objective',
          domain,
          text,
          sourceSignal: rootId,
          priority: signal.priority ?? 50,
          status: 'ready',
          semanticFrame,
          attractorContract,
          amplification:signal.amplification || null,
          requireDomainReceptor:signal.requireDomainReceptor===true,
          routeCandidates,
          obligationId:obligation?.id || null,
          requiredVerificationMode:obligation?.requiredVerificationMode || null,
          dependsOn: [rootId],
          effect: obligation ? (obligation.effect || obligation.text) : selectedEffect.effect
        });
      }
    }
  }
  return { schema: 'mondayid.intent-graph.v4', nodes };
}
