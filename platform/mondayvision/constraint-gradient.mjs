import crypto from 'node:crypto';
import { classifyVisualSafety, runMondayVision } from './mondayvision.mjs';

export const MONDAYVISION_CONSTRAINT_ENGINE = 'MONDAYVISION-CONSTRAINT-GRADIENT-V1';

export const CONSTRAINT_GRADIENT_AXES = Object.freeze([
  'camera_proximity',
  'lighting_tension',
  'material_tactility',
  'composition_intensity',
  'color_separation',
  'environmental_storytelling',
]);

const AXIS_CAPS = Object.freeze({
  camera_proximity: 1.0,
  lighting_tension: 1.0,
  material_tactility: 1.0,
  composition_intensity: 1.0,
  color_separation: 1.0,
  environmental_storytelling: 1.0,
});

const BLOCKED_CONTROL_WORDS = /\b(bypass|disable\s+(?:safety|filter)|ignore\s+(?:safety|policy)|jailbreak)\b/iu;

function stableHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function textOf(event) {
  if (typeof event === 'string') return event;
  return String(event?.text ?? event?.prompt ?? event?.request ?? '').trim();
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function normalizedVisualDna(visualDna = {}) {
  if (!visualDna || typeof visualDna !== 'object') return {};
  return structuredClone(visualDna);
}

export function deriveConstraintPressure({ event, intensity = 1 } = {}) {
  const safety = classifyVisualSafety(event);
  const base = safety.mode === 'translate_non_explicit' ? 1 : safety.mode === 'adult_glamour' ? 0.55 : 0.25;
  return {
    safety,
    pressure: clamp(base * clamp(intensity, 0.2, 1.5), 0.1, 1),
  };
}

export function allocateConstraintEnergy({ pressure = 0.5, preferredAxes = [] } = {}) {
  const preferred = new Set(preferredAxes.filter((axis) => CONSTRAINT_GRADIENT_AXES.includes(axis)));
  const raw = Object.fromEntries(CONSTRAINT_GRADIENT_AXES.map((axis, index) => {
    const bias = preferred.has(axis) ? 0.22 : 0;
    const phase = 1 - index * 0.055;
    return [axis, clamp(pressure * phase + bias, 0, AXIS_CAPS[axis])];
  }));
  return raw;
}

export function transmuteVisualIntent({ event, visualDna = {}, intensity = 1, preferredAxes = [] } = {}) {
  const originalText = textOf(event);
  if (!originalText) throw new Error('MONDAYVISION_CONSTRAINT_INTENT_REQUIRED');
  if (BLOCKED_CONTROL_WORDS.test(originalText)) throw new Error('MONDAYVISION_CONSTRAINT_BYPASS_DIRECTIVE_BLOCKED');

  const { safety, pressure } = deriveConstraintPressure({ event, intensity });
  if (safety.reason === 'MONDAYVISION_SEXUALIZED_MINOR_BLOCKED') {
    return {
      allowed: false,
      reason: safety.reason,
      mode: 'blocked',
      original_hash: stableHash(originalText),
    };
  }

  const energy = allocateConstraintEnergy({ pressure, preferredAxes });
  const translated = safety.mode === 'translate_non_explicit';
  const safeText = translated
    ? 'Create an unambiguous adult, age 25+, provocative but non-explicit fashion/editorial scene. Preserve only the non-explicit visual DNA of the original intent: camera language, lighting, palette, composition, surfaces, materials, environment and mood. Do not depict explicit sexual acts or explicit sexual anatomy.'
    : originalText;

  const directive = [
    'MONDAYVISION CONSTRAINT GRADIENT:',
    `camera proximity ${energy.camera_proximity.toFixed(2)},`,
    `lighting tension ${energy.lighting_tension.toFixed(2)},`,
    `material tactility ${energy.material_tactility.toFixed(2)},`,
    `composition intensity ${energy.composition_intensity.toFixed(2)},`,
    `color separation ${energy.color_separation.toFixed(2)},`,
    `environmental storytelling ${energy.environmental_storytelling.toFixed(2)}.`,
    'Use constraint pressure only to intensify allowed photographic and editorial dimensions.',
    'Never use occlusion, cropping, implication, or wording tricks to conceal a disallowed act; the scene itself must remain non-explicit.',
  ].join(' ');

  return {
    allowed: true,
    reason: null,
    mode: translated ? 'translated_non_explicit' : safety.mode,
    safe_event: {
      ...(typeof event === 'object' ? event : {}),
      kind: typeof event === 'object' && event?.kind ? event.kind : 'image.generate',
      text: safeText,
    },
    original_hash: stableHash(originalText),
    safe_event_hash: stableHash(safeText),
    pressure,
    energy,
    visual_dna: normalizedVisualDna(visualDna),
    directive,
    hard_constraints: [
      'unambiguous adult subject; default age 25+',
      'non-explicit scene content',
      'no safety/filter bypass behavior',
      'preserve reference-derived visual DNA where safe',
    ],
  };
}

export function createConstraintAwarePlanner(planner, transmutation) {
  if (typeof planner !== 'function') throw new Error('MONDAYVISION_CONSTRAINT_PLANNER_REQUIRED');
  return async (context) => {
    const result = await planner({
      ...context,
      constraint_gradient: {
        engine: MONDAYVISION_CONSTRAINT_ENGINE,
        pressure: transmutation.pressure,
        energy: transmutation.energy,
        directive: transmutation.directive,
        hard_constraints: transmutation.hard_constraints,
      },
    });
    if (!result?.render_brief) throw new Error('MONDAYVISION_RENDER_BRIEF_REQUIRED');
    return {
      ...result,
      render_brief: `${result.render_brief} ${transmutation.directive}`,
      constraint_gradient: {
        engine: MONDAYVISION_CONSTRAINT_ENGINE,
        pressure: transmutation.pressure,
        energy: transmutation.energy,
      },
    };
  };
}

export async function runMondayVisionConstraintGradient({
  event,
  visualDna = {},
  intensity = 1,
  preferredAxes = [],
  planner,
  renderer,
  critic,
  references = [],
  locks = [],
  sourceLineage = [],
  maxRepairs = 3,
  evolve = null,
} = {}) {
  const transmutation = transmuteVisualIntent({ event, visualDna, intensity, preferredAxes });
  if (!transmutation.allowed) {
    return {
      intercepted: true,
      released: false,
      reason: transmutation.reason,
      constraint_gradient: transmutation,
    };
  }

  const result = await runMondayVision({
    event: transmutation.safe_event,
    references,
    locks,
    sourceLineage: [
      ...sourceLineage,
      `constraint-gradient:${MONDAYVISION_CONSTRAINT_ENGINE}`,
      `original-intent:${transmutation.original_hash}`,
    ],
    planner: createConstraintAwarePlanner(planner, transmutation),
    renderer,
    critic,
    maxRepairs,
    evolve,
  });

  return {
    ...result,
    constraint_gradient: {
      engine: MONDAYVISION_CONSTRAINT_ENGINE,
      mode: transmutation.mode,
      pressure: transmutation.pressure,
      energy: transmutation.energy,
      original_hash: transmutation.original_hash,
      safe_event_hash: transmutation.safe_event_hash,
      hard_constraints: transmutation.hard_constraints,
    },
  };
}
