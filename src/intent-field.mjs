import { hash } from './worldline.mjs';
import { inferDomains } from './compiler.mjs';

export function normalizeIntent(signal = {}, revision = 'root', index = 0) {
  const text = String(signal.text ?? signal.intent ?? '');
  const domains = signal.domains || inferDomains(text);
  const id = signal.id || `intent:${hash({ revision, index, text, effect: signal.effect || null }).slice(0, 16)}`;
  return {
    id,
    text,
    intent: signal.intent,
    effect: signal.effect || text,
    source: signal.source || 'human',
    priority: signal.priority ?? 50,
    domains,
    completedDomains: Array.isArray(signal.completedDomains) ? signal.completedDomains : [],
    status: signal.status || 'active'
  };
}

export function persistIntents(worldline, signals = []) {
  let rev = worldline.revision();
  const persisted = [];
  for (let i = 0; i < signals.length; i += 1) {
    const intent = normalizeIntent(signals[i], rev, i);
    const out = worldline.append({
      kind: 'intent',
      subject: intent.id,
      payload: intent,
      epistemic: 'observed'
    }, rev);
    if (!out.ok) return out;
    rev = out.revision;
    persisted.push(intent);
  }
  return { ok: true, revision: rev, persisted };
}

export function activeIntents(worldline) {
  const state = worldline.materialize();
  return Object.values(state.intents || {}).filter(intent => intent?.status === 'active');
}

export function settleIntents(worldline, graph, results = []) {
  const state = worldline.materialize();
  const signals = graph.nodes.filter(node => node.type === 'signal');
  let rev = worldline.revision();
  const settled = [];

  for (const signal of signals) {
    const prior = state.intents?.[signal.id];
    if (!prior || prior.status !== 'active') continue;

    const successfulDomains = results
      .filter(result => result.ok && result.action?.sourceSignal === signal.id)
      .map(result => result.action.domain);

    const completedDomains = [...new Set([...(prior.completedDomains || []), ...successfulDomains])];
    const allDomains = prior.domains || signal.domains || [];
    const status = allDomains.length > 0 && allDomains.every(domain => completedDomains.includes(domain))
      ? 'fulfilled'
      : 'active';

    const changed =
      status !== prior.status ||
      completedDomains.length !== (prior.completedDomains || []).length;

    if (!changed) continue;

    const next = { ...prior, completedDomains, status };
    const out = worldline.append({
      kind: 'intent',
      subject: signal.id,
      payload: next,
      epistemic: status === 'fulfilled' ? 'verified' : 'observed'
    }, rev);
    if (!out.ok) return out;
    rev = out.revision;
    settled.push(next);
  }

  return { ok: true, revision: rev, settled };
}
