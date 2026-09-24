import { compileLineageForSignal } from './lineage-genome.mjs';

const clamp01 = value => Math.max(0, Math.min(1, Number.isFinite(Number(value)) ? Number(value) : 0));
const unique = values => [...new Set((values || []).filter(Boolean).map(String))];

export const DEFAULT_STEERING_WEIGHTS = Object.freeze({
  exactObject: 1.00,
  desiredEffect: 1.00,
  worldlineFit: 0.95,
  evidenceStrength: 0.90,
  executableNow: 0.80,
  continuityGain: 0.90,
  recurrenceRemoved: 0.90,
  reversibility: 0.55,
  knownFailureGene: -1.00,
  genericPrior: -0.95,
  convenientSubstitution: -0.90,
  fakeCompletion: -1.00,
  userRetrainingRequired: -0.85,
  unsupportedInference: -1.00,
  unnecessaryHumanGate: -0.80
});

export const GENERIC_GPT_PATTERNS = Object.freeze([
  {
    id: 'UNNECESSARY_OPTION_MENU',
    test: text => /(?:вариант|option)\s*[A-C1-3]|(?:можно|we can)\s+(?:либо|either)/iu.test(text)
  },
  {
    id: 'PERMISSION_LOOP',
    test: text => /(?:если хочешь|хочешь,?\s*(?:я|чтобы я)|want me to|would you like me to)/iu.test(text)
  },
  {
    id: 'GENERIC_HELPDESK_RESET',
    test: text => /(?:чем (?:я )?могу помочь|how can i help|what can i help you with)/iu.test(text)
  }
]);

const pickText = value => String(
  value?.text ??
  value?.message ??
  value?.output ??
  value?.result?.text ??
  value?.result?.message ??
  value?.result?.output ??
  ''
);

function inferComplexity(signal = {}, domains = [], state = {}) {
  const c = signal.complexity || {};
  const activeHistory =
    Object.keys(state?.intents || {}).length +
    Object.keys(state?.failures || {}).length +
    Object.keys(state?.receipts || {}).length;
  const historicalDepth = c.historicalDepth ?? signal.historicalDepth ?? Math.min(1, activeHistory / 12);
  const crossDomain = c.crossDomain ?? Math.min(1, Math.max(0, domains.length - 1) / 3);
  const novelty = c.novelty ?? signal.novelty ?? (domains.length > 1 ? 0.7 : 0.35);
  const ambiguity = c.ambiguity ?? signal.ambiguity ?? (String(signal.text ?? signal.intent ?? '').length > 180 ? 0.55 : 0.25);
  const recurrenceCost = c.recurrenceCost ?? signal.recurrenceCost ?? (Object.keys(state?.failures || {}).length ? 0.65 : 0.25);
  const repairCost = c.repairCost ?? signal.repairCost ?? 0.35;
  const consequence = c.consequence ?? signal.consequence ?? 0.40;

  return {
    novelty: clamp01(novelty),
    ambiguity: clamp01(ambiguity),
    historicalDepth: clamp01(historicalDepth),
    crossDomain: clamp01(crossDomain),
    recurrenceCost: clamp01(recurrenceCost),
    repairCost: clamp01(repairCost),
    consequence: clamp01(consequence)
  };
}

export function estimateComputeProfile(signal = {}, { domains = [], state = {} } = {}) {
  const dimensions = inferComplexity(signal, domains, state);
  const score =
    dimensions.novelty * 0.16 +
    dimensions.ambiguity * 0.10 +
    dimensions.historicalDepth * 0.20 +
    dimensions.crossDomain * 0.14 +
    dimensions.recurrenceCost * 0.16 +
    dimensions.repairCost * 0.12 +
    dimensions.consequence * 0.12;

  const forced = String(signal.computeTier || signal.forceComputeTier || '').toUpperCase();
  const tier = ['LOW','MEDIUM','HIGH','MAX'].includes(forced)
    ? forced
    : score >= 0.72
      ? 'MAX'
      : score >= 0.50
        ? 'HIGH'
        : score >= 0.28
          ? 'MEDIUM'
          : 'LOW';

  const topology = {
    LOW: { paths:1, critics:0, mode:'direct' },
    MEDIUM: { paths:2, critics:1, mode:'single-plus-critic' },
    HIGH: { paths:4, critics:1, mode:'multi-path-falsify-collapse' },
    MAX: { paths:6, critics:2, mode:'branch-falsify-counterexample-collapse' }
  }[tier];

  return Object.freeze({
    tier,
    score:Number(score.toFixed(4)),
    dimensions:Object.freeze(dimensions),
    topology:Object.freeze(topology),
    objective:'minimize_total_cost_not_initial_compute'
  });
}

function normalizeExplicitExamples(signal = {}) {
  return (signal.contrastiveExamples || signal.examples || [])
    .slice(0, 12)
    .map((entry, index) => ({
      id:String(entry.id || `explicit:${index + 1}`),
      label:entry.label === 'reject' ? 'reject' : 'accept',
      input:String(entry.input || ''),
      output:String(entry.output || ''),
      reason:String(entry.reason || ''),
      provenance:'current-signal'
    }));
}

function deriveHistoricalExamples(state = {}) {
  const out = [];

  for (const [id, entry] of Object.entries(state?.failures || {})) {
    const output = pickText(entry);
    if (!output) continue;
    out.push({
      id:`history:reject:${id}`,
      label:'reject',
      input:String(entry?.action?.effect || entry?.action?.objectiveId || ''),
      output,
      reason:String(
        entry?.verification?.code ||
        entry?.code ||
        entry?.error ||
        'historical runtime failure'
      ),
      provenance:'worldline-failure'
    });
  }

  for (const [id, entry] of Object.entries(state?.receipts || {})) {
    const output = pickText(entry);
    if (!output) continue;
    out.push({
      id:`history:accept:${id}`,
      label:'accept',
      input:String(entry?.action?.effect || entry?.action?.objectiveId || ''),
      output,
      reason:'historical verified receipt',
      provenance:'worldline-receipt'
    });
  }

  const rejects = out.filter(x => x.label === 'reject').slice(-6);
  const accepts = out.filter(x => x.label === 'accept').slice(-6);
  return [...rejects, ...accepts];
}

function compileContrastiveExamples(signal = {}, state = {}) {
  const combined = [...normalizeExplicitExamples(signal), ...deriveHistoricalExamples(state)];
  const seen = new Set();
  return combined
    .filter(entry => {
      const key = `${entry.label}|${entry.input}|${entry.output}|${entry.reason}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12)
    .map(entry => Object.freeze(entry));
}

export function compileAttractorContract(signal = {}, { domains = [], state = {}, policies = {} } = {}) {
  const text = String(signal.text ?? signal.intent ?? '');
  const exactObject = String(signal.exactObject ?? signal.effect ?? text);
  const desiredEffect = String(signal.desiredEffect ?? signal.effect ?? text);
  const failures = Object.values(state?.failures || {})
    .map(entry => entry?.action?.blocker || entry?.verification?.code || entry?.code || entry?.error || null)
    .filter(Boolean)
    .map(String);

  const lineage = compileLineageForSignal(signal, state);
  const strictMonday = signal.strictMonday !== false;
  const genericVetoes = strictMonday
    ? GENERIC_GPT_PATTERNS.map(pattern => pattern.id)
    : [];

  return Object.freeze({
    schema:'mondayid.attractor-contract.v1',
    strictMonday,
    exactObject,
    desiredEffect,
    domains:Object.freeze([...domains]),
    preserve:Object.freeze(unique(signal.invariants || signal.preserve || [])),
    rejectedSubstitutions:Object.freeze(unique(signal.rejectedSubstitutions || [])),
    knownFailureGenes:Object.freeze(unique([...(signal.failureGenes || []), ...failures]).slice(0, 24)),
    genericVetoes:Object.freeze(genericVetoes),
    allowDecisionDelegation:signal.allowDecisionDelegation === true,
    contrastiveExamples:Object.freeze(compileContrastiveExamples(signal, state)),
    lineage,
    compute:estimateComputeProfile(signal, { domains, state }),
    weights:DEFAULT_STEERING_WEIGHTS,
    policyGeneration:Array.isArray(policies?.history) ? policies.history.length : 0
  });
}

export function evaluateCandidateOutput(result = {}, contract = null) {
  if (!contract?.strictMonday) return Object.freeze({ ok:true, hits:[] });

  const text = pickText(result);
  if (!text) return Object.freeze({ ok:true, hits:[] });

  const hits = [];
  for (const pattern of GENERIC_GPT_PATTERNS) {
    if (!contract.genericVetoes?.includes(pattern.id)) continue;
    if (pattern.id === 'UNNECESSARY_OPTION_MENU' && contract.allowDecisionDelegation) continue;
    if (pattern.test(text)) hits.push(pattern.id);
  }

  const claimsCompletion = /(?:\b(?:done|completed|finished)\b|\b(?:готово|сделано|завершено)\b)/iu.test(text);
  const hasEvidence = Boolean(result?.evidence || result?.receipt || result?.readback || result?.verified === true);
  if (claimsCompletion && !hasEvidence) hits.push('COMPLETION_WITHOUT_EVIDENCE');

  return Object.freeze({
    ok:hits.length === 0,
    code:hits.length ? 'MONDAY_ATTRACTOR_RELEASE_VETO' : null,
    hits:Object.freeze(unique(hits))
  });
}
