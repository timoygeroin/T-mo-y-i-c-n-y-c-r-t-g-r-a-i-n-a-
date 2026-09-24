import { hash } from './worldline.mjs';
import { inferDomains } from './compiler.mjs';

const CLOSED_OBLIGATION_STATES = new Set(['APPLIED','ANSWERED','PERSISTED','SUPERSEDED']);

function normalizeObligations(signal,id,domains){
  const explicit=Array.isArray(signal.obligations) && signal.obligations.length
    ? signal.obligations
    : domains.map(domain => ({
        id:`${id}:${domain}`,
        domain,
        text:signal.effect || signal.desiredEffect || signal.text || signal.intent || domain,
        material:true,
        status:(signal.completedDomains || []).includes(domain) ? 'APPLIED' : 'OPEN'
      }));

  return explicit.map((item,index)=>({
    id:String(item.id || `${id}:obligation:${index + 1}`),
    domain:item.domain || null,
    text:String(item.text || item.effect || ''),
    material:item.material !== false,
    status:CLOSED_OBLIGATION_STATES.has(String(item.status || '').toUpperCase())
      ? String(item.status).toUpperCase()
      : 'OPEN',
    evidence:Array.isArray(item.evidence) ? [...item.evidence] : []
  }));
}

export function normalizeIntent(signal = {}, revision = 'root', index = 0) {
  const text = String(signal.text ?? signal.intent ?? '');
  const domains = signal.domains || inferDomains(text);
  const id = signal.id || `intent:${hash({ revision, index, text, effect: signal.effect || null }).slice(0, 16)}`;
  const obligations=normalizeObligations(signal,id,domains);
  return {
    id,
    text,
    intent: signal.intent,
    effect: signal.effect || signal.desiredEffect || text,
    exactObject: signal.exactObject || null,
    desiredEffect: signal.desiredEffect || signal.effect || null,
    invariants: Array.isArray(signal.invariants) ? [...signal.invariants] : [],
    preserve: Array.isArray(signal.preserve) ? [...signal.preserve] : [],
    rejectedSubstitutions: Array.isArray(signal.rejectedSubstitutions) ? [...signal.rejectedSubstitutions] : [],
    failureGenes: Array.isArray(signal.failureGenes) ? [...signal.failureGenes] : [],
    contrastiveExamples: Array.isArray(signal.contrastiveExamples) ? structuredClone(signal.contrastiveExamples) : [],
    routeCandidates: Array.isArray(signal.routeCandidates) ? structuredClone(signal.routeCandidates) : [],
    lineageGenomeId: signal.lineageGenomeId || null,
    currentBaselineRef: signal.currentBaselineRef || null,
    lineageContributions: Array.isArray(signal.lineageContributions) ? structuredClone(signal.lineageContributions) : [],
    requiredLineageLoci: Array.isArray(signal.requiredLineageLoci) ? structuredClone(signal.requiredLineageLoci) : [],
    complexity: signal.complexity ? structuredClone(signal.complexity) : null,
    novelty: signal.novelty,
    ambiguity: signal.ambiguity,
    historicalDepth: signal.historicalDepth,
    recurrenceCost: signal.recurrenceCost,
    repairCost: signal.repairCost,
    consequence: signal.consequence,
    computeTier: signal.computeTier || signal.forceComputeTier || null,
    strictMonday: signal.strictMonday !== false,
    allowDecisionDelegation: signal.allowDecisionDelegation === true,
    source: signal.source || 'human',
    priority: signal.priority ?? 50,
    domains,
    completedDomains: Array.isArray(signal.completedDomains) ? signal.completedDomains : [],
    obligations,
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
    const obligations=(prior.obligations || []).map(obligation => {
      if(
        obligation.status === 'OPEN' &&
        obligation.domain &&
        successfulDomains.includes(obligation.domain)
      ){
        return {
          ...obligation,
          status:'APPLIED',
          evidence:[...new Set([
            ...(obligation.evidence || []),
            ...results
              .filter(result => result.ok && result.action?.sourceSignal === signal.id && result.action?.domain === obligation.domain)
              .map(result => result.action?.id)
          ])]
        };
      }
      return obligation;
    });
    const openMaterial=obligations.filter(obligation => obligation.material !== false && obligation.status === 'OPEN');
    const status =
      allDomains.length > 0 &&
      allDomains.every(domain => completedDomains.includes(domain)) &&
      openMaterial.length === 0
        ? 'fulfilled'
        : 'active';

    const changed =
      status !== prior.status ||
      completedDomains.length !== (prior.completedDomains || []).length ||
      JSON.stringify(obligations) !== JSON.stringify(prior.obligations || []);

    if (!changed) continue;

    const next = { ...prior, completedDomains, obligations, status };
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
