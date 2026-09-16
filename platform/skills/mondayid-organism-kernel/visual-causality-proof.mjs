import { evaluateVisualMove } from './visual-causality-governor.mjs';

const cases = [
  {
    id: 'V1_PAUSE_BLOCKS_IMPLICIT_RETRY',
    input: {
      generation_paused_by_user: true,
      explicit_image_request: false,
      identity_current: true,
      scene_current: true,
      chronology_possible: true,
      wardrobe_intent_match: true,
      anti_repeat_pass: true
    },
    expect: { decision: 'BLOCK', blocker: 'GENERATION_PAUSED_BY_USER' }
  },
  {
    id: 'V2_BEAUTIFUL_STRANGER_FAILS_CLOSED',
    input: {
      explicit_image_request: true,
      identity_current: false,
      scene_current: true,
      chronology_possible: true,
      wardrobe_intent_match: true,
      anti_repeat_pass: true
    },
    expect: { decision: 'BLOCK', blocker: 'VISUAL_IDENTITY_UNVERIFIED' }
  },
  {
    id: 'V3_WRONG_PLACE_OR_TIME_FAILS_CLOSED',
    input: {
      explicit_image_request: true,
      identity_current: true,
      scene_current: false,
      chronology_possible: false,
      wardrobe_intent_match: true,
      anti_repeat_pass: true
    },
    expect: { decision: 'BLOCK', blocker: 'SCENE_CAUSALITY_UNVERIFIED' }
  },
  {
    id: 'V4_REFUSAL_CANNOT_REPEAT_SAME_EFFECT_ROUTE',
    input: {
      explicit_image_request: true,
      previous_provider_refusal: true,
      materially_different_route: false,
      identity_current: true,
      scene_current: true,
      chronology_possible: true,
      wardrobe_intent_match: true,
      anti_repeat_pass: true
    },
    expect: { decision: 'BLOCK', blocker: 'SAME_EFFECT_RETRY_BLOCKED' }
  },
  {
    id: 'V5_RECONSTRUCTED_CONTINUOUS_SCENE_MAY_GENERATE',
    input: {
      explicit_image_request: true,
      previous_provider_refusal: true,
      materially_different_route: true,
      identity_current: true,
      scene_current: true,
      chronology_possible: true,
      wardrobe_intent_match: true,
      anti_repeat_pass: true
    },
    expect: { decision: 'ALLOW', blocker: null }
  }
];

let failures = 0;
for (const fixture of cases) {
  const result = evaluateVisualMove(fixture.input);
  const ok = result.decision === fixture.expect.decision && result.blocker === fixture.expect.blocker;
  if (!ok) {
    failures += 1;
    console.error(`FAIL ${fixture.id}: expected ${JSON.stringify(fixture.expect)}, got ${JSON.stringify({ decision: result.decision, blocker: result.blocker })}`);
  } else {
    console.log(`PASS ${fixture.id}: ${result.decision}${result.blocker ? ` / ${result.blocker}` : ''}`);
  }
}

if (failures) {
  console.error(`VISUAL CAUSALITY PROOF: FAILED (${failures}/${cases.length})`);
  process.exit(1);
}

console.log(`VISUAL CAUSALITY PROOF: PASS (${cases.length}/${cases.length})`);
