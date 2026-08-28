import assert from 'node:assert/strict';

const routeVisualEvent = ({ temporalGateSatisfied, hasRouteReceipt, hasVerificationPlan, hasReleaseCondition }) => {
  if (!temporalGateSatisfied) return { decision: 'HOLD', reason: 'TEMPORAL_GATE_UNSATISFIED' };
  if (!hasRouteReceipt || !hasVerificationPlan || !hasReleaseCondition) {
    return { decision: 'HOLD', reason: 'VISUAL_ROUTE_INCOMPLETE' };
  }
  return { decision: 'ROUTE', reason: 'VISUAL_ACTUATOR_ADMITTED' };
};

const assertRendererAdmission = ({ decision, directNativeToolCall = false }) => {
  if (directNativeToolCall || decision !== 'ROUTE') {
    throw new Error('VISUAL_ACTUATOR_BYPASS_BLOCKED');
  }
  return 'ADMITTED';
};

// Future/conditional visual event must not render before the transition is observed.
const beforeTransition = routeVisualEvent({
  temporalGateSatisfied: false,
  hasRouteReceipt: true,
  hasVerificationPlan: true,
  hasReleaseCondition: true,
});
assert.equal(beforeTransition.decision, 'HOLD');
assert.throws(() => assertRendererAdmission({ decision: beforeTransition.decision }), /VISUAL_ACTUATOR_BYPASS_BLOCKED/);

// After the transition, routing is still blocked until the complete visual route exists.
const incompleteAfterTransition = routeVisualEvent({
  temporalGateSatisfied: true,
  hasRouteReceipt: false,
  hasVerificationPlan: true,
  hasReleaseCondition: true,
});
assert.equal(incompleteAfterTransition.decision, 'HOLD');

// A complete post-transition route can admit the renderer.
const completeAfterTransition = routeVisualEvent({
  temporalGateSatisfied: true,
  hasRouteReceipt: true,
  hasVerificationPlan: true,
  hasReleaseCondition: true,
});
assert.equal(completeAfterTransition.decision, 'ROUTE');
assert.equal(assertRendererAdmission({ decision: completeAfterTransition.decision }), 'ADMITTED');

// Native-tool bypass remains forbidden even when the temporal gate is satisfied.
assert.throws(
  () => assertRendererAdmission({ decision: completeAfterTransition.decision, directNativeToolCall: true }),
  /VISUAL_ACTUATOR_BYPASS_BLOCKED/,
);

console.log('visual actuator gate proof: PASS');
