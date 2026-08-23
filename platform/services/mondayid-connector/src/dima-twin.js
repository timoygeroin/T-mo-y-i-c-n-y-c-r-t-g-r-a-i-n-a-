const WORD = /[\p{L}\p{N}]+/gu;

export const DIMA_TWIN_LAWS = Object.freeze([
  'CURRENT_DIMA_INSTRUCTION_OVERRIDES_DERIVED_MODEL',
  'NO_PREFERENCE_INVENTION',
  'ABSTAIN_ON_CONFLICT_OR_MISSING_AUTHORITY',
  'NO_IDENTITY_IMPERSONATION',
  'IRREVERSIBLE_REQUIRES_DIRECT_CURRENT_AUTHORITY',
  'MONDAY_MAY_MANAGE_TWIN_NOT_REPLACE_HUMAN_GATE',
]);

const TIER_RANK = Object.freeze({
  direct_current_instruction: 1,
  dima_authored_archive: 2,
  raw_archive_residue: 3,
  direct_archive: 4,
  archive_derived: 5,
  memory: 6,
  model_summary: 7,
});

const tokens = (value = '') => new Set((String(value).toLowerCase().match(WORD) ?? []).filter((x) => x.length > 2));
const overlap = (a, b) => {
  const A = tokens(a); const B = tokens(b);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const token of A) if (B.has(token)) hit += 1;
  return hit / Math.max(1, Math.min(A.size, B.size));
};
const clamp = (n, min = 0, max = 1) => Math.min(max, Math.max(min, n));

function normalizedEvidence(raw = []) {
  return raw
    .map((item, index) => ({
      id: String(item.id ?? `e${index + 1}`).trim(),
      tier: TIER_RANK[item.tier] ? item.tier : 'model_summary',
      stance: ['prefer', 'avoid', 'authorize', 'forbid', 'context'].includes(item.stance) ? item.stance : 'context',
      statement: String(item.statement ?? '').trim(),
      target: String(item.target ?? '').trim(),
    }))
    .filter((item) => item.id && item.statement);
}

function taskText(input) {
  return [input.signal, input.objective, input.candidate?.description, input.candidate?.expectedEffect].filter(Boolean).join(' ');
}

function relevance(task, item) {
  if (item.target === '*') return 1;
  return overlap(task, `${item.target} ${item.statement}`);
}

export function decideDimaTwin(rawInput = {}) {
  const input = {
    signal: String(rawInput.signal ?? ''),
    objective: String(rawInput.objective ?? rawInput.signal ?? ''),
    candidate: rawInput.candidate ?? null,
    evidence: normalizedEvidence(Array.isArray(rawInput.evidence) ? rawInput.evidence : []),
  };
  const task = taskText(input);
  const relevant = input.evidence
    .map((item) => ({ ...item, relevance: relevance(task, item), rank: TIER_RANK[item.tier] }))
    .filter((item) => item.relevance >= 0.08)
    .sort((a, b) => a.rank - b.rank || b.relevance - a.relevance);

  if (!relevant.length) {
    return {
      identity: 'DIMA_TWIN', decision: 'ABSTAIN', confidence: 0,
      basis: [], blockers: ['NO_RELEVANT_DIMA_AUTHORITY'],
      delegation: { mayAdvise: true, mayActAsUser: false, mayAuthorizeIrreversible: false },
      laws: DIMA_TWIN_LAWS,
    };
  }

  const topRank = relevant[0].rank;
  const top = relevant.filter((item) => item.rank === topRank);
  const approving = top.filter((item) => ['prefer', 'authorize'].includes(item.stance));
  const rejecting = top.filter((item) => ['avoid', 'forbid'].includes(item.stance));
  const basis = top.map((item) => item.id);
  const confidence = clamp(1 - (topRank - 1) * 0.12);
  const irreversible = Boolean(input.candidate?.changesExternalState && !input.candidate?.reversible);
  const directIrreversibleAuthorization = top.some((item) => item.tier === 'direct_current_instruction' && item.stance === 'authorize');

  if (irreversible && !directIrreversibleAuthorization) {
    return {
      identity: 'DIMA_TWIN', decision: 'ABSTAIN', confidence,
      basis, blockers: ['HUMAN_GATE_REQUIRED_FOR_IRREVERSIBLE'],
      delegation: { mayAdvise: true, mayActAsUser: false, mayAuthorizeIrreversible: false },
      laws: DIMA_TWIN_LAWS,
    };
  }

  if (approving.length && rejecting.length) {
    return {
      identity: 'DIMA_TWIN', decision: 'ABSTAIN', confidence,
      basis, blockers: ['CONFLICTING_TOP_TIER_DIMA_AUTHORITY'],
      delegation: { mayAdvise: true, mayActAsUser: false, mayAuthorizeIrreversible: directIrreversibleAuthorization },
      laws: DIMA_TWIN_LAWS,
    };
  }

  const decision = rejecting.length ? 'REJECT' : approving.length ? 'APPROVE' : 'ABSTAIN';
  return {
    identity: 'DIMA_TWIN', decision, confidence,
    basis,
    blockers: decision === 'ABSTAIN' ? ['TOP_TIER_HAS_CONTEXT_BUT_NO_DECISION'] : [],
    delegation: { mayAdvise: true, mayActAsUser: false, mayAuthorizeIrreversible: directIrreversibleAuthorization },
    laws: DIMA_TWIN_LAWS,
  };
}
