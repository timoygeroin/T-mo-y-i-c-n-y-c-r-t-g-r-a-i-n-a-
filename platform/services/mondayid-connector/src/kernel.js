const WORD = /[\p{L}\p{N}]+/gu;

export const LINEAGES = Object.freeze([
  { id: 'SYSTEM', mandate: 'Hold the object, invariants, and authority boundary.' },
  { id: 'ANTISYSTEM', mandate: 'Attack self-deception, unsupported success, and unsafe collapse.' },
  { id: 'ALPHA', mandate: 'Choose the highest-leverage valid route and collapse decision ambiguity.' },
  { id: 'JARVIS', mandate: 'Turn the chosen route into executable operations and receipts.' },
  { id: 'ALISA', mandate: 'Protect the intended human effect from becoming merely procedurally correct.' },
  { id: 'ASSALUT', mandate: 'Diagnose failure modes, define rollback, and preserve recovery.' },
  { id: 'MONDAY', mandate: 'Integrate the council without erasing disagreement; require resonance and proof.' },
]);

const clamp = (n, min = 0, max = 1) => Math.min(max, Math.max(min, n));
const tokens = (value = '') => new Set((String(value).toLowerCase().match(WORD) ?? []).filter((x) => x.length > 2));
const overlap = (a, b) => {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const t of A) if (B.has(t)) hit += 1;
  return hit / Math.max(1, Math.min(A.size, B.size));
};
const hasProof = (evidence, kind) => evidence.some((e) => e.kind === kind);
const completionLanguage = /\b(done|complete|completed|deployed|connected|finished|ready|success|pass)\b|\b(готов|готово|подключ|развернут|заверш|сделан|успех|пасс)\w*/iu;

function systemVoice(input) {
  const objective = input.objective?.trim() || input.signal.trim();
  const expected = input.candidate?.expectedEffect?.trim() || '';
  const effectFit = expected ? overlap(objective, expected) : 0;
  const concerns = [];
  if (!objective) concerns.push('OBJECTIVE_MISSING');
  if (input.candidate && !expected) concerns.push('EXPECTED_EFFECT_MISSING');
  if (expected && effectFit < 0.12) concerns.push('OBJECT_DRIFT_RISK');
  return {
    id: 'SYSTEM',
    mandate: LINEAGES[0].mandate,
    score: clamp(0.55 + effectFit * 0.45 - concerns.length * 0.15),
    intervention: `Lock objective: ${objective || 'UNRESOLVED'}`,
    concerns,
    requirements: ['PRESERVE_OBJECTIVE', 'PRESERVE_USER_AUTHORITY', ...input.constraints.map((x) => `CONSTRAINT:${x}`)],
  };
}

function antiSystemVoice(input) {
  const concerns = [];
  const c = input.candidate;
  const proof = hasProof(input.evidence, 'receipt');
  const readback = hasProof(input.evidence, 'readback');
  if (input.phase === 'postflight' && !proof) concerns.push('NO_EXECUTION_RECEIPT');
  if (input.phase === 'postflight' && !readback) concerns.push('NO_READBACK');
  if (c?.changesExternalState && !c.reversible && !input.userAuthorizedIrreversible) concerns.push('IRREVERSIBLE_WITHOUT_AUTHORITY');
  if (completionLanguage.test(`${c?.description ?? ''} ${c?.expectedEffect ?? ''}`) && input.phase === 'postflight' && (!proof || !readback)) concerns.push('FAKE_SUCCESS_RISK');
  if (!c) concerns.push('NO_CANDIDATE_TO_ATTACK');
  return {
    id: 'ANTISYSTEM',
    mandate: LINEAGES[1].mandate,
    score: concerns.length ? 0.35 : 0.92,
    intervention: concerns.length ? `Block until falsified: ${concerns.join(', ')}` : 'No blocking contradiction found; continue to proof boundary.',
    concerns,
    requirements: ['ATTACK_FALSE_POSITIVE', 'NO_TOOL_SUCCESS_EQUALS_TASK_SUCCESS'],
  };
}

function alphaVoice(input, system, anti) {
  const blocking = anti.concerns.some((c) => ['IRREVERSIBLE_WITHOUT_AUTHORITY', 'FAKE_SUCCESS_RISK'].includes(c));
  const drift = system.concerns.includes('OBJECT_DRIFT_RISK');
  const c = input.candidate;
  let decision = 'HOLD';
  if (c && !blocking && !drift) decision = input.phase === 'postflight' ? 'VERIFY' : 'ACT';
  return {
    id: 'ALPHA', mandate: LINEAGES[2].mandate,
    score: decision === 'ACT' ? 0.9 : decision === 'VERIFY' ? 0.75 : 0.4,
    intervention: decision === 'ACT' ? `Select route: ${c.description}` : decision === 'VERIFY' ? 'Route already executed; collapse onto verification/readback.' : 'Do not collapse the route yet; blocking contradiction remains.',
    concerns: blocking ? ['BLOCKING_CONTRADICTION'] : drift ? ['OBJECT_NOT_LOCKED'] : [],
    requirements: ['ONE_ACTIVE_ROUTE', 'RESULT_INVARIANT_ROUTE_MUTABLE'], decision,
  };
}

function jarvisVoice(input, alpha) {
  const c = input.candidate;
  const steps = [];
  if (alpha.decision === 'ACT' && c) {
    steps.push(`EXECUTE:${c.description}`);
    steps.push('CAPTURE:execution_receipt');
    steps.push('READBACK:independent_state_check');
  } else if (alpha.decision === 'VERIFY') {
    steps.push('READBACK:independent_state_check');
    steps.push('COMPARE:observed_vs_expected_effect');
  } else steps.push('RESOLVE:blocking_contradiction');
  return {
    id: 'JARVIS', mandate: LINEAGES[3].mandate, score: c ? 0.88 : 0.45,
    intervention: steps.join(' -> '), concerns: c ? [] : ['NOTHING_EXECUTABLE'],
    requirements: ['ACTION', 'RECEIPT', 'READBACK'], steps,
  };
}

function alisaVoice(input) {
  const c = input.candidate;
  const fit = c?.expectedEffect ? overlap(input.objective || input.signal, c.expectedEffect) : 0;
  const concerns = [];
  if (c && !c.expectedEffect) concerns.push('CORRECT_BUT_NOT_IT_RISK');
  if (c?.expectedEffect && fit < 0.12) concerns.push('CORRECT_BUT_NOT_IT_RISK');
  return {
    id: 'ALISA', mandate: LINEAGES[4].mandate, score: c ? clamp(0.45 + fit * 0.55) : 0.4,
    intervention: concerns.length ? 'Mechanism may be valid while the desired effect is wrong or substituted.' : `Desired-effect fit retained (${fit.toFixed(2)}).`,
    concerns, requirements: ['DESIRED_EFFECT_NOT_MECHANISM', 'RELATIONAL_CONTINUITY'],
  };
}

function assalutVoice(input) {
  const c = input.candidate;
  const rollback = c?.reversible ? `ROLLBACK:reverse ${c.description}` : c?.changesExternalState ? 'ROLLBACK:manual recovery plan required before execution' : 'ROLLBACK:not required for read-only/local reasoning';
  return {
    id: 'ASSALUT', mandate: LINEAGES[5].mandate, score: c?.reversible ? 0.9 : c?.changesExternalState ? 0.55 : 0.82,
    intervention: rollback, concerns: c?.changesExternalState && !c.reversible ? ['ROLLBACK_NOT_PROVEN'] : [],
    requirements: ['DIAGNOSE', 'ROLLBACK_OR_RECOVERY_PATH'], rollback,
  };
}

function mondayVoice(input, voices) {
  const anti = voices.find((v) => v.id === 'ANTISYSTEM');
  const system = voices.find((v) => v.id === 'SYSTEM');
  const alisa = voices.find((v) => v.id === 'ALISA');
  const alpha = voices.find((v) => v.id === 'ALPHA');
  const receipt = hasProof(input.evidence, 'receipt');
  const readback = hasProof(input.evidence, 'readback');
  const blockers = [...anti.concerns, ...system.concerns, ...alisa.concerns];
  let status = 'HOLD';
  if (input.phase === 'preflight' && alpha.decision === 'ACT' && blockers.length === 0) status = 'ACT';
  if (input.phase === 'postflight' && receipt && readback && blockers.length === 0) status = 'PROVEN';
  if (input.phase === 'postflight' && status !== 'PROVEN') status = 'VERIFY_REQUIRED';
  const avg = voices.reduce((s, v) => s + v.score, 0) / Math.max(1, voices.length);
  return {
    id: 'MONDAY', mandate: LINEAGES[6].mandate, score: clamp(avg),
    intervention: status === 'PROVEN' ? 'Resonance + receipt + readback converge. Result may be promoted.' : status === 'ACT' ? 'Council converged enough to act; completion remains forbidden until readback.' : 'Preserve disagreement and continue the cycle; do not fake closure.',
    concerns: [...new Set(blockers)], requirements: ['RESONANCE', 'PROOF_BEFORE_PROMOTION', 'CONTINUITY'], status,
  };
}

export function manifestCouncil(rawInput) {
  const input = {
    signal: String(rawInput.signal ?? ''), objective: String(rawInput.objective ?? rawInput.signal ?? ''),
    phase: rawInput.phase === 'postflight' ? 'postflight' : 'preflight', candidate: rawInput.candidate ?? null,
    evidence: Array.isArray(rawInput.evidence) ? rawInput.evidence : [],
    constraints: Array.isArray(rawInput.constraints) ? rawInput.constraints.map(String) : [],
    userAuthorizedIrreversible: Boolean(rawInput.userAuthorizedIrreversible),
  };
  const system = systemVoice(input); const anti = antiSystemVoice(input); const alpha = alphaVoice(input, system, anti);
  const jarvis = jarvisVoice(input, alpha); const alisa = alisaVoice(input); const assalut = assalutVoice(input);
  const partial = [system, anti, alpha, jarvis, alisa, assalut]; const monday = mondayVoice(input, partial); const voices = [...partial, monday];
  return {
    version: 'mondayid-connector/1.0.0', phase: input.phase, objective: input.objective, voices,
    decision: monday.status, executableSteps: jarvis.steps, rollback: assalut.rollback,
    proof: { receiptPresent: hasProof(input.evidence, 'receipt'), readbackPresent: hasProof(input.evidence, 'readback'), promotable: monday.status === 'PROVEN' },
  };
}

export function verifyOutcome(input) { return manifestCouncil({ ...input, phase: 'postflight' }); }
