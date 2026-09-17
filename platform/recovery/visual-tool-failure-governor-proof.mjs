import assert from "node:assert/strict";
import {
  classifyVisualTurn,
  createVisualToolState,
  evaluateVisualInvocation,
  postToolFailureSurface,
  recordVisualToolResult,
  setGenerationPause,
} from "./visual-tool-failure-governor.mjs";

assert.equal(classifyVisualTurn("21:03"), "TIMESTAMP_UPDATE");
assert.equal(classifyVisualTurn("Иии?"), "RECOVERY_CONVERSATION");
assert.equal(classifyVisualTurn("Не вижу"), "RECOVERY_CONVERSATION");
assert.equal(classifyVisualTurn("И опять исчезла"), "RECOVERY_CONVERSATION");
assert.equal(classifyVisualTurn("Почини все"), "RECOVERY_CONVERSATION");
assert.equal(classifyVisualTurn("Покажи меня в этом платье"), "EXPLICIT_RENDER_REQUEST");

let state = createVisualToolState({ pending_visual_objective: "Monday in exact garment reference" });
state = recordVisualToolResult(state, {
  status: "REFUSED",
  routeFamily: "exact-garment-transparent-fashion-transfer",
  failureReason: "provider moderation refusal",
});

const timeTurn = evaluateVisualInvocation(state, {
  message: "21:03",
  routeFamily: "exact-garment-transparent-fashion-transfer",
  preflightGreen: true,
  materiallyChanged: true,
});
assert.equal(timeTurn.allow_generation, false);
assert.equal(timeTurn.reasons.includes("NO_EXPLICIT_RENDER_REQUEST"), true);
assert.equal(timeTurn.raw_provider_refusal_may_be_only_user_surface, false);

const conversationalTurn = evaluateVisualInvocation(state, {
  message: "Иии?",
  routeFamily: "exact-garment-transparent-fashion-transfer",
  preflightGreen: true,
  materiallyChanged: true,
});
assert.equal(conversationalTurn.allow_generation, false);

const sameRoute = evaluateVisualInvocation(state, {
  message: "Покажи меня в этом платье",
  routeFamily: "exact-garment-transparent-fashion-transfer",
  preflightGreen: true,
  materiallyChanged: false,
  userExplicitlyReopened: true,
});
assert.equal(sameRoute.allow_generation, false);
assert.equal(sameRoute.reasons.includes("UNRESOLVED_REFUSAL_FAMILY"), true);
assert.equal(sameRoute.reasons.includes("ROUTE_NOT_MATERIALLY_CHANGED_AFTER_REFUSAL"), true);

const changedRoute = evaluateVisualInvocation(state, {
  message: "Покажи меня в этом платье",
  routeFamily: "fashion-garment-identity-transfer-v2",
  preflightGreen: true,
  materiallyChanged: true,
  userExplicitlyReopened: true,
});
assert.equal(changedRoute.allow_generation, true);
assert.equal(changedRoute.next_action, "INVOKE_ONCE_THEN_READBACK");

state = setGenerationPause(state, true);
const paused = evaluateVisualInvocation(state, {
  message: "Покажи меня в этом платье",
  routeFamily: "fashion-garment-identity-transfer-v2",
  preflightGreen: true,
  materiallyChanged: true,
  userExplicitlyReopened: false,
});
assert.equal(paused.allow_generation, false);
assert.equal(paused.reasons.includes("GENERATION_PAUSED_BY_USER"), true);

const failureSurface = postToolFailureSurface(createVisualToolState(), {
  routeFamily: "fashion-garment-identity-transfer-v2",
});
assert.equal(failureSurface.release, "HUMAN_RESPONSE_REQUIRED");
assert.equal(failureSurface.renderer_retry_same_turn, false);
assert.equal(failureSurface.preserve_scene, true);
assert.equal(failureSurface.preserve_pending_objective, true);
assert.equal(failureSurface.expose_raw_provider_refusal_as_only_response, false);

console.log(JSON.stringify({
  proof: "VISUAL_TOOL_FAILURE_CONTAINMENT_20260917",
  status: "PASS",
  timestamp_does_not_render: true,
  conversational_followup_does_not_render: true,
  unresolved_route_cannot_retry: true,
  materially_changed_green_route_can_render_once: true,
  raw_refusal_cannot_be_only_surface: true,
}, null, 2));
