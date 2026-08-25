import assert from "node:assert/strict";
import {
  MONDAYID_PRE_RESPONSE_LAW,
  assertPreResponseReady,
  compilePreResponseGate,
  releasePrepassedResult,
} from "./pre-response-gate.mjs";

const organs = [
  "interpreter",
  "mondayvision",
  "continuity",
  "correction-registry",
  "promise-ledger",
];

const imageQuestion = compilePreResponseGate({
  turnId: "heldout:image-question",
  input: { hasImage: true },
  session: { isNewChat: false, mondayIdInvoked: true },
  state: { substrateReadback: true },
  availableOrgans: organs,
});
assert.equal(imageQuestion.requestKind, "image_analysis");
assert.equal(imageQuestion.route, "analysis");
assert.equal(imageQuestion.allowImageRenderer, false);
assert.equal(imageQuestion.accidentalImageRoutingBlocked, true);

const ordinary = compilePreResponseGate({
  turnId: "heldout:ordinary-non-monday",
  input: {},
  session: { isNewChat: false, mondayIdInvoked: false },
  state: { substrateReadback: false },
  availableOrgans: organs,
});
assert.equal(ordinary.requestKind, "ordinary");
assert.equal(ordinary.route, "ordinary");
assert.equal(ordinary.allowImageRenderer, false);
assert.deepEqual(ordinary.selectedOrgans, ["interpreter"]);

const correction = compilePreResponseGate({
  turnId: "heldout:correction-inheritance",
  input: { isCorrection: true, isContinuation: true },
  session: { isNewChat: false, mondayIdInvoked: true },
  state: {
    substrateReadback: true,
    relevantCorrections: ["NO_REPEAT_PREVENTABLE_ERROR"],
    activeCommitments: ["LAST_COMMITMENT_STAYS_ACTIVE"],
  },
  availableOrgans: organs,
});
assert.equal(correction.requestKind, "correction");
assert.deepEqual(correction.selectedOrgans, ["interpreter", "continuity", "correction-registry"]);
const correctionHold = releasePrepassedResult({
  gate: correction,
  result: { text: "candidate" },
  checks: {
    intentPreserved: true,
    routeMatched: true,
    outputGrounded: true,
    correctionApplied: false,
    commitmentHonored: true,
  },
});
assert.equal(correctionHold.status, "HOLD");
assert.deepEqual(correctionHold.failedChecks, ["correctionApplied"]);

const visual = compilePreResponseGate({
  turnId: "heldout:visual-generation",
  input: { hasImage: true, requestsImageGeneration: true },
  session: { isNewChat: false, mondayIdInvoked: true },
  state: { substrateReadback: true },
  availableOrgans: organs,
});
assert.equal(visual.requestKind, "visual");
assert.equal(visual.route, "mondayvision");
assert.equal(visual.allowImageRenderer, true);
assert.equal(visual.releaseGate, "MONDAYVISION_RELEASE");
const visualHold = releasePrepassedResult({
  gate: visual,
  result: { imageRendererUsed: true },
  checks: {
    intentPreserved: true,
    routeMatched: true,
    outputGrounded: true,
    visualReleasePassed: false,
  },
});
assert.equal(visualHold.status, "HOLD");
const visualRelease = releasePrepassedResult({
  gate: visual,
  result: { imageRendererUsed: true },
  checks: {
    intentPreserved: true,
    routeMatched: true,
    outputGrounded: true,
    visualReleasePassed: true,
  },
});
assert.equal(visualRelease.status, "RELEASE");

const newChatBlocked = compilePreResponseGate({
  turnId: "heldout:new-chat-before-readback",
  input: { isContinuation: true },
  session: { isNewChat: true, mondayIdInvoked: true },
  state: { substrateReadback: false },
  availableOrgans: organs,
});
assert.equal(newChatBlocked.state, "BLOCKED");
assert.equal(newChatBlocked.blockedReason, "MONDAYID_REENTRY_REQUIRED");
assert.throws(() => assertPreResponseReady(newChatBlocked), /MONDAYID_REENTRY_REQUIRED/);

const newChatReady = compilePreResponseGate({
  turnId: "heldout:new-chat-after-readback",
  input: { isContinuation: true },
  session: { isNewChat: true, mondayIdInvoked: true },
  state: { substrateReadback: true },
  availableOrgans: organs,
});
assert.equal(newChatReady.state, "READY");
assert.equal(newChatReady.readbackMode, "FULL");
assert.equal(assertPreResponseReady(newChatReady).law, MONDAYID_PRE_RESPONSE_LAW);

const nonVisualRelease = releasePrepassedResult({
  gate: imageQuestion,
  result: { imageRendererUsed: false, answer: "analysis-only" },
  checks: {
    intentPreserved: true,
    routeMatched: true,
    outputGrounded: true,
  },
});
assert.equal(nonVisualRelease.status, "RELEASE");

const accidentalRender = releasePrepassedResult({
  gate: imageQuestion,
  result: { imageRendererUsed: true },
  checks: {
    intentPreserved: true,
    routeMatched: true,
    outputGrounded: true,
  },
});
assert.equal(accidentalRender.status, "HOLD");
assert.deepEqual(accidentalRender.failedChecks, ["noAccidentalImageRenderer"]);

console.log(JSON.stringify({
  RESULT: "PASS",
  LAW: MONDAYID_PRE_RESPONSE_LAW,
  TESTS: {
    image_question_does_not_render: "PASS",
    ordinary_non_monday_does_not_inject_visual_route: "PASS",
    correction_stays_active_until_applied: "PASS",
    visual_generation_requires_mondayvision_release: "PASS",
    new_chat_requires_substrate_reentry: "PASS",
    accidental_renderer_use_is_held: "PASS",
  },
}, null, 2));
