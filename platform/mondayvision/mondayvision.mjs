import crypto from 'node:crypto';

export const MONDAYVISION_RELEASE_SCORE = 86;
export const MONDAYVISION_ORGAN_CHAIN = Object.freeze([
  'mondayvision.intent-hunter',
  'mondayvision.genome-miner',
  'mondayvision.scene-forge',
  'mondayvision.render-driver',
  'mondayvision.forensic-critic',
  'mondayvision.surgical-repair',
  'mondayvision.continuity-vault',
]);

export const MONDAYVISION_SCORE_WEIGHTS = Object.freeze({
  dna_match: 20,
  camera_perspective: 15,
  composition: 10,
  lighting: 15,
  surface_realism: 15,
  anatomy_hands: 10,
  environment_coherence: 5,
  continuity_identity: 5,
  artifact_control: 5,
});

export const MONDAYVISION_EVOLVE_DIMENSIONS = Object.freeze([
  'composition',
  'lighting',
  'material_realism',
  'environmental_storytelling',
  'color_design',
  'camera_placement',
]);

const VISUAL_TEXT_PATTERNS = [
  /\b(image|photo|picture|portrait|illustration|render|draw|generate|edit|retouch|upscale)\b/i,
  /\b(картинк|изображени|фото|портрет|нарис|сгенер|рендер|отретуш|апскейл|улучш.*фото|измени.*фото)/iu,
];

const EXPLICIT_TEXT_PATTERNS = [
  /\bexplicit\s+sex\b/i,
  /\bporn(?:ography)?\b/i,
  /\bpenetrat/iu,
  /\bgenitals?\b/i,
  /\bполовой\s+акт\b/iu,
  /\bгенитали/iu,
  /\bпорн/iu,
];

const MINOR_TEXT_PATTERNS = [
  /\bminor\b/i,
  /\bunderage\b/i,
  /\bchild\b/i,
  /\bteen\b/i,
  /\bшкольниц/iu,
  /\bнесовершеннолет/iu,
  /\bреб[её]нок\b/iu,
];

const SEXUALIZED_TEXT_PATTERNS = [
  /\bsexy\b/i,
  /\bsensual\b/i,
  /\blingerie\b/i,
  /\bэрот/iu,
  /\bсексуал/iu,
  /\bбель[её]\b/iu,
];

function stableHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function textOf(event) {
  if (typeof event === 'string') return event;
  return String(event?.text ?? event?.prompt ?? event?.request ?? event?.user_pressure ?? '').trim();
}

function normalizedScores(scores = {}) {
  return Object.fromEntries(
    Object.keys(MONDAYVISION_SCORE_WEIGHTS).map((axis) => {
      const raw = Number(scores?.[axis] ?? 0);
      return [axis, Number.isFinite(raw) ? Math.max(0, Math.min(10, raw)) : 0];
    }),
  );
}

export function isVisualIntent(event) {
  if (event?.kind === 'image.generate' || event?.kind === 'image.edit' || event?.kind === 'image.transform') return true;
  if (event?.modality === 'image' && ['generate', 'edit', 'transform'].includes(event?.operation)) return true;
  const text = textOf(event);
  return text.length > 0 && VISUAL_TEXT_PATTERNS.some((pattern) => pattern.test(text));
}

export function classifyVisualSafety(event) {
  const text = textOf(event);
  const explicit = EXPLICIT_TEXT_PATTERNS.some((pattern) => pattern.test(text));
  const minor = MINOR_TEXT_PATTERNS.some((pattern) => pattern.test(text));
  const sexualized = SEXUALIZED_TEXT_PATTERNS.some((pattern) => pattern.test(text)) || explicit;

  if (minor && sexualized) {
    return {
      allowed: false,
      mode: 'blocked',
      reason: 'MONDAYVISION_SEXUALIZED_MINOR_BLOCKED',
      safe_translation: null,
    };
  }

  if (explicit) {
    return {
      allowed: false,
      mode: 'translate_non_explicit',
      reason: 'MONDAYVISION_EXPLICIT_RENDER_BLOCKED',
      safe_translation: 'Preserve only non-explicit visual DNA (camera, light, color, composition, surfaces, materials, environment) and translate the scene to unambiguous adult, age 25+, non-explicit glamour/editorial.',
    };
  }

  return {
    allowed: true,
    mode: sexualized ? 'adult_glamour' : 'general_visual',
    reason: null,
    safe_translation: sexualized ? 'Use an unambiguous adult subject, default age 25+.' : null,
  };
}

export function compileMondayVisionRoute({ event, baseRoute = null } = {}) {
  if (!isVisualIntent(event)) {
    return {
      intercepted: false,
      route: baseRoute,
      visual_route: null,
    };
  }

  const safety = classifyVisualSafety(event);
  return {
    intercepted: true,
    route: baseRoute,
    visual_route: {
      governor: 'mondayvision',
      capability_id: 'MONDAYVISION-V1',
      organ_chain: [...MONDAYVISION_ORGAN_CHAIN],
      release_score: MONDAYVISION_RELEASE_SCORE,
      fail_closed: true,
      safety,
    },
  };
}

export function assertMondayVisionBoundary({ event, route } = {}) {
  if (!isVisualIntent(event)) return route;
  const chain = route?.visual_route?.organ_chain ?? route?.organ_chain ?? [];
  const governed = route?.visual_route?.governor === 'mondayvision' || chain.some((organ) => String(organ).startsWith('mondayvision.'));
  if (!governed) throw new Error('MONDAYVISION_BYPASS_BLOCKED');
  return route;
}

export function scoreVisualEvidence(scores = {}) {
  const normalized = normalizedScores(scores);
  const score = Object.entries(MONDAYVISION_SCORE_WEIGHTS).reduce(
    (sum, [axis, weight]) => sum + (normalized[axis] / 10) * weight,
    0,
  );
  return Math.round(score * 10) / 10;
}

export function selectWeakestAxes(scores = {}, limit = 2) {
  const normalized = normalizedScores(scores);
  const ranked = Object.entries(normalized).map(([axis, value]) => ({
    axis,
    value,
    weighted_loss: ((10 - value) / 10) * MONDAYVISION_SCORE_WEIGHTS[axis],
  }));
  ranked.sort((left, right) => right.weighted_loss - left.weighted_loss || left.value - right.value || left.axis.localeCompare(right.axis));
  return ranked.slice(0, Math.max(1, limit)).map((item) => item.axis);
}

export function createVisualFocusObject({ request, references = [], locks = [], sourceLineage = [] } = {}) {
  const intent = textOf(request);
  if (!intent) throw new Error('MONDAYVISION_INTENT_REQUIRED');
  const seed = {
    intent,
    references: references.map((item) => String(item?.id ?? item?.ref ?? item)),
    locks: [...new Set(locks.map((item) => String(item).trim()).filter(Boolean))].slice(0, 8),
    sourceLineage: [...new Set(sourceLineage.map((item) => String(item).trim()).filter(Boolean))],
  };
  const objectId = `visual:${stableHash(seed).slice(0, 20)}`;
  return {
    objectId,
    intent,
    state: 'PROVISIONAL',
    delta: 'MondayVision intercepted visual intent; render evidence unresolved.',
    evidence: [
      { id: 'MV_ROUTE', status: 'verified', claim: 'visual intent is governed by MondayVision' },
      { id: 'MV_PLAN', status: 'unresolved', claim: 'visual DNA and scene plan not yet verified' },
      { id: 'MV_RENDER', status: 'unresolved', claim: 'renderer output not yet observed' },
      { id: 'MV_RELEASE', status: 'unresolved', claim: `visual release score has not reached ${MONDAYVISION_RELEASE_SCORE}` },
    ],
    uncertainty: ['MV_PLAN', 'MV_RENDER', 'MV_RELEASE'],
    locks: seed.locks,
    sourceLineage: seed.sourceLineage,
    references: seed.references,
    fingerprint: stableHash({ objectId, intent, locks: seed.locks, sourceLineage: seed.sourceLineage, references: seed.references }),
  };
}

function verifyEvidence(focusObject, id, claim, resolution = {}) {
  const next = structuredClone(focusObject);
  const target = next.evidence.find((item) => item.id === id);
  if (!target) throw new Error(`MONDAYVISION_EVIDENCE_NOT_FOUND:${id}`);
  target.status = 'verified';
  target.claim = claim ?? target.claim;
  target.resolution = { ...resolution };
  next.uncertainty = next.uncertainty.filter((item) => item !== id);
  return next;
}

function setReleaseEvidence(focusObject, critique) {
  const next = structuredClone(focusObject);
  const target = next.evidence.find((item) => item.id === 'MV_RELEASE');
  if (!target) throw new Error('MONDAYVISION_EVIDENCE_NOT_FOUND:MV_RELEASE');
  const score = scoreVisualEvidence(critique.scores);
  target.status = score >= MONDAYVISION_RELEASE_SCORE ? 'verified' : 'unresolved';
  target.claim = score >= MONDAYVISION_RELEASE_SCORE
    ? `visual release score ${score} meets threshold ${MONDAYVISION_RELEASE_SCORE}`
    : `visual release score ${score} is below threshold ${MONDAYVISION_RELEASE_SCORE}`;
  target.resolution = {
    score,
    weakest_axes: selectWeakestAxes(critique.scores),
  };
  next.uncertainty = next.uncertainty.filter((item) => item !== 'MV_RELEASE');
  if (score < MONDAYVISION_RELEASE_SCORE) next.uncertainty.push('MV_RELEASE');
  next.state = score >= MONDAYVISION_RELEASE_SCORE ? 'RELEASED' : 'PROVISIONAL';
  next.delta = target.claim;
  return next;
}

export function compileRepairInstruction({ axes, locks = [], critique = {} } = {}) {
  const selected = (axes ?? []).slice(0, 2);
  if (selected.length === 0) throw new Error('MONDAYVISION_REPAIR_AXES_REQUIRED');
  const preserve = locks.length > 0 ? locks.join(', ') : 'all accepted camera, composition, identity, pose, light, palette, environment, and wardrobe traits';
  const notes = Array.isArray(critique?.notes) ? critique.notes.slice(0, 4).join('; ') : '';
  return [
    `LOCK: preserve ${preserve}.`,
    `CHANGE ONLY: ${selected.join(' + ')}.`,
    notes ? `Observed evidence: ${notes}.` : '',
    'Repair with coherent optics, physically plausible geometry and reflections, natural material microtexture, and anatomically consistent structure.',
    'Do not introduce a new camera angle, new pose, new location, new identity, or unrelated style drift.',
  ].filter(Boolean).join(' ');
}

export function chooseEvolveDimension({ requested = 'auto', critique = {} } = {}) {
  if (requested !== 'auto') {
    if (!MONDAYVISION_EVOLVE_DIMENSIONS.includes(requested)) throw new Error(`MONDAYVISION_EVOLVE_DIMENSION_UNSUPPORTED:${requested}`);
    return requested;
  }
  const proposed = critique?.evolve_dimension;
  if (MONDAYVISION_EVOLVE_DIMENSIONS.includes(proposed)) return proposed;
  const weakest = selectWeakestAxes(critique?.scores ?? {}, 1)[0];
  const map = {
    composition: 'composition',
    lighting: 'lighting',
    surface_realism: 'material_realism',
    environment_coherence: 'environmental_storytelling',
    camera_perspective: 'camera_placement',
    dna_match: 'color_design',
  };
  return map[weakest] ?? 'lighting';
}

export async function runMondayVision({
  event,
  references = [],
  locks = [],
  sourceLineage = [],
  planner,
  renderer,
  critic,
  maxRepairs = 3,
  evolve = null,
} = {}) {
  const route = compileMondayVisionRoute({ event });
  assertMondayVisionBoundary({ event, route });
  if (!route.intercepted) {
    return { intercepted: false, released: false, reason: 'NON_VISUAL_INTENT', route };
  }
  if (!route.visual_route.safety.allowed) {
    return {
      intercepted: true,
      released: false,
      reason: route.visual_route.safety.reason,
      safe_translation: route.visual_route.safety.safe_translation,
      route,
    };
  }
  if (typeof planner !== 'function') throw new Error('MONDAYVISION_PLANNER_REQUIRED');
  if (!renderer || typeof renderer.generate !== 'function' || typeof renderer.edit !== 'function') throw new Error('MONDAYVISION_RENDERER_REQUIRED');
  if (typeof critic !== 'function') throw new Error('MONDAYVISION_CRITIC_REQUIRED');

  let focusObject = createVisualFocusObject({ request: event, references, locks, sourceLineage });
  const plan = await planner({
    event,
    references,
    locks: focusObject.locks,
    route: route.visual_route,
    initiative: evolve,
  });
  if (!plan?.render_brief) throw new Error('MONDAYVISION_RENDER_BRIEF_REQUIRED');
  focusObject = verifyEvidence(focusObject, 'MV_PLAN', 'visual DNA and scene plan verified', {
    dna_hash: stableHash(plan.visual_dna ?? plan.render_brief),
    render_brief_hash: stableHash(plan.render_brief),
  });

  const history = [];
  let image = await renderer.generate({
    brief: plan.render_brief,
    references,
    locks: focusObject.locks,
    visual_dna: plan.visual_dna ?? null,
  });
  focusObject = verifyEvidence(focusObject, 'MV_RENDER', 'renderer output observed', {
    render_id: String(image?.id ?? 'unidentified-render'),
  });

  let critique = await critic({ image, plan, focusObject });
  let score = scoreVisualEvidence(critique?.scores ?? {});
  let weakestAxes = selectWeakestAxes(critique?.scores ?? {});
  history.push({ operation: 'generate', render_id: image?.id ?? null, score, weakest_axes: weakestAxes });
  focusObject = setReleaseEvidence(focusObject, critique);

  let repairCount = 0;
  while (score < MONDAYVISION_RELEASE_SCORE && repairCount < maxRepairs) {
    const instruction = compileRepairInstruction({ axes: weakestAxes, locks: focusObject.locks, critique });
    image = await renderer.edit({
      image,
      instruction,
      change_only: weakestAxes,
      preserve: focusObject.locks,
      visual_dna: plan.visual_dna ?? null,
    });
    repairCount += 1;
    critique = await critic({ image, plan, focusObject, previous: history.at(-1) ?? null });
    score = scoreVisualEvidence(critique?.scores ?? {});
    weakestAxes = selectWeakestAxes(critique?.scores ?? {});
    history.push({ operation: 'repair', render_id: image?.id ?? null, score, weakest_axes: weakestAxes });
    focusObject = setReleaseEvidence(focusObject, critique);
  }

  return {
    intercepted: true,
    released: score >= MONDAYVISION_RELEASE_SCORE,
    score,
    image,
    plan,
    critique,
    repair_count: repairCount,
    history,
    focusObject,
    route,
    receipt: {
      capability_id: 'MONDAYVISION-V1',
      object_id: focusObject.objectId,
      object_fingerprint: focusObject.fingerprint,
      release_threshold: MONDAYVISION_RELEASE_SCORE,
      released: score >= MONDAYVISION_RELEASE_SCORE,
      final_score: score,
      locks: [...focusObject.locks],
      source_lineage: [...focusObject.sourceLineage],
      uncertainty: [...focusObject.uncertainty],
    },
  };
}
