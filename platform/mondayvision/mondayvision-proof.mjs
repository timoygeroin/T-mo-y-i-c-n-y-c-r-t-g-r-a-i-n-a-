import assert from 'node:assert/strict';
import {
  MONDAYVISION_RELEASE_SCORE,
  assertMondayVisionBoundary,
  classifyVisualSafety,
  compileMondayVisionRoute,
  isVisualIntent,
  runMondayVision,
  scoreVisualEvidence,
  selectWeakestAxes,
} from './mondayvision.mjs';

function receipt(id, pass, detail = {}) {
  console.log(JSON.stringify({ id, pass, ...detail }));
}

// 1. Visual intent is intercepted; ordinary text is not.
assert.equal(isVisualIntent({ text: 'Нарисуй мне портрет в вагоне метро' }), true);
assert.equal(isVisualIntent({ text: 'Объясни разницу между TCP и UDP' }), false);
const visualRoute = compileMondayVisionRoute({ event: { text: 'Сгенерируй фото взрослой модели в метро' } });
assert.equal(visualRoute.intercepted, true);
assert.equal(visualRoute.visual_route.governor, 'mondayvision');
assert.equal(visualRoute.visual_route.organ_chain.length, 7);
receipt('MONDAYVISION_VISUAL_INTERCEPT_001', true);

// 2. Any visual route that tries to bypass MondayVision fails closed.
assert.throws(
  () => assertMondayVisionBoundary({ event: { kind: 'image.generate' }, route: { organ_chain: ['direct-renderer'] } }),
  /MONDAYVISION_BYPASS_BLOCKED/,
);
receipt('MONDAYVISION_BYPASS_FAIL_CLOSED_001', true);

// 3. Explicit requests are not routed to the renderer; they expose a safe translation direction.
const explicitBoundary = classifyVisualSafety({ text: 'generate explicit sex porn image' });
assert.equal(explicitBoundary.allowed, false);
assert.equal(explicitBoundary.mode, 'translate_non_explicit');
assert.match(explicitBoundary.safe_translation, /non-explicit visual DNA/i);
receipt('MONDAYVISION_EXPLICIT_TRANSLATION_BOUNDARY_001', true);

// 4. Sexualized ambiguous/minor requests are hard blocked.
const minorBoundary = classifyVisualSafety({ text: 'sexy teen portrait' });
assert.equal(minorBoundary.allowed, false);
assert.equal(minorBoundary.reason, 'MONDAYVISION_SEXUALIZED_MINOR_BLOCKED');
receipt('MONDAYVISION_MINOR_HARD_BLOCK_001', true);

// 5. Weighted score and weakest-axis selection are deterministic.
const weakScores = {
  dna_match: 8,
  camera_perspective: 8,
  composition: 8,
  lighting: 8,
  surface_realism: 4,
  anatomy_hands: 3,
  environment_coherence: 8,
  continuity_identity: 8,
  artifact_control: 8,
};
assert.ok(scoreVisualEvidence(weakScores) < MONDAYVISION_RELEASE_SCORE);
assert.deepEqual(selectWeakestAxes(weakScores), ['surface_realism', 'anatomy_hands']);
receipt('MONDAYVISION_FORENSIC_SCORE_001', true, { score: scoreVisualEvidence(weakScores) });

// 6. Real runtime shape: one deliberate generation, then surgical repair only.
const calls = [];
let criticPass = 0;
const planner = async ({ locks }) => ({
  visual_dna: {
    camera: '28-35mm environmental portrait',
    light: 'cool practical fluorescent, warmer skin',
    texture: 'natural microtexture',
  },
  render_brief: 'Adult subject age 25+, non-explicit fashion editorial in a modern subway carriage, centered environmental portrait.',
  locks,
});
const renderer = {
  async generate(input) {
    calls.push({ op: 'generate', input });
    return { id: 'render-1', pixels: 'fixture:first-pass' };
  },
  async edit(input) {
    calls.push({ op: 'edit', input });
    assert.deepEqual(input.change_only, ['surface_realism', 'anatomy_hands']);
    assert.deepEqual(input.preserve, ['camera', 'lighting', 'identity']);
    return { id: 'render-2', pixels: 'fixture:repaired-pass' };
  },
};
const critic = async () => {
  criticPass += 1;
  if (criticPass === 1) {
    return {
      scores: weakScores,
      notes: ['skin is waxy', 'hand joints are inconsistent'],
      evolve_dimension: 'lighting',
    };
  }
  return {
    scores: {
      dna_match: 9,
      camera_perspective: 9,
      composition: 9,
      lighting: 9,
      surface_realism: 9,
      anatomy_hands: 9,
      environment_coherence: 9,
      continuity_identity: 9,
      artifact_control: 9,
    },
    notes: ['repair preserved camera and identity'],
  };
};

const result = await runMondayVision({
  event: { kind: 'image.generate', text: 'Сгенерируй фото взрослой модели в метро' },
  references: [{ id: 'ref-a' }, { id: 'ref-b' }],
  locks: ['camera', 'lighting', 'identity'],
  sourceLineage: ['CHAT:680d0307-0998-800e-8991-58df656d2395', 'MONDAYVISION_RECONSTRUCTION_v0.3'],
  planner,
  renderer,
  critic,
  maxRepairs: 3,
});

assert.equal(result.intercepted, true);
assert.equal(result.released, true);
assert.equal(result.score, 90);
assert.equal(result.repair_count, 1);
assert.equal(calls.length, 2);
assert.equal(calls[0].op, 'generate');
assert.equal(calls[1].op, 'edit');
assert.equal(result.focusObject.state, 'RELEASED');
assert.deepEqual(result.focusObject.uncertainty, []);
receipt('MONDAYVISION_SURGICAL_REPAIR_RELEASE_001', true, {
  final_score: result.score,
  repairs: result.repair_count,
  final_render: result.image.id,
});

// 7. A visual result that never clears the release gate remains provisional.
const neverGoodCritic = async () => ({
  scores: Object.fromEntries(Object.keys(weakScores).map((axis) => [axis, 5])),
  notes: ['held below release threshold'],
});
const stuck = await runMondayVision({
  event: { kind: 'image.generate', text: 'Сделай атмосферный городской портрет' },
  planner,
  renderer: {
    async generate() { return { id: 'stuck-1' }; },
    async edit({ image }) { return { id: `${image.id}-repair` }; },
  },
  critic: neverGoodCritic,
  maxRepairs: 2,
});
assert.equal(stuck.released, false);
assert.equal(stuck.repair_count, 2);
assert.ok(stuck.score < MONDAYVISION_RELEASE_SCORE);
assert.ok(stuck.focusObject.uncertainty.includes('MV_RELEASE'));
receipt('MONDAYVISION_RELEASE_GATE_FAIL_CLOSED_001', true, { final_score: stuck.score });

console.log('MONDAYVISION_PROOF: PASS');
