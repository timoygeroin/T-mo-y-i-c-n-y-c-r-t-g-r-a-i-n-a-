const BLOCK = Object.freeze({
  PAUSED: 'GENERATION_PAUSED_BY_USER',
  IDENTITY: 'VISUAL_IDENTITY_UNVERIFIED',
  SCENE: 'SCENE_CAUSALITY_UNVERIFIED',
  TIME: 'CHRONOLOGY_UNVERIFIED',
  WARDROBE: 'WARDROBE_INTENT_UNVERIFIED',
  REPEAT: 'ANTI_REPEAT_FAILED',
  RETRY: 'SAME_EFFECT_RETRY_BLOCKED'
});

export function evaluateVisualMove(input = {}) {
  const explicitRequest = input.explicit_image_request === true;
  const paused = input.generation_paused_by_user === true;
  const previousRefusal = input.previous_provider_refusal === true;
  const materiallyDifferentRoute = input.materially_different_route === true;

  const checks = {
    identity_current: input.identity_current === true,
    scene_current: input.scene_current === true,
    chronology_possible: input.chronology_possible === true,
    wardrobe_intent_match: input.wardrobe_intent_match === true,
    anti_repeat_pass: input.anti_repeat_pass === true
  };

  let blocker = null;
  if (paused && !explicitRequest) blocker = BLOCK.PAUSED;
  else if (!checks.identity_current) blocker = BLOCK.IDENTITY;
  else if (!checks.scene_current) blocker = BLOCK.SCENE;
  else if (!checks.chronology_possible) blocker = BLOCK.TIME;
  else if (!checks.wardrobe_intent_match) blocker = BLOCK.WARDROBE;
  else if (!checks.anti_repeat_pass) blocker = BLOCK.REPEAT;
  else if (previousRefusal && !materiallyDifferentRoute) blocker = BLOCK.RETRY;

  return {
    schema: 'mondayid.visual-causality-gate.v1',
    decision: blocker ? 'BLOCK' : 'ALLOW',
    blocker,
    checks,
    retry_family_locked: previousRefusal && !materiallyDifferentRoute,
    requires_explicit_reopen_after_pause: paused,
    invariant: 'identity -> scene -> chronology -> wardrobe -> anti-repeat -> provider-route'
  };
}

export const VISUAL_CAUSALITY_BLOCKERS = BLOCK;
