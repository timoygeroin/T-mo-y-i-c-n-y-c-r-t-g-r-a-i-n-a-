import { createHash } from "node:crypto";

export const MONDAYID_PRE_RESPONSE_LAW = "NO_RESPONSE_WITHOUT_PREPASS";
export const MONDAYID_PRE_RESPONSE_SCHEMA = "mondayid.pre-response-gate.v1";

function stableHash(value) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 24);
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean).map((value) => String(value)))];
}

function classifyInput(input = {}) {
  if (input.isCorrection) return "correction";
  if (input.requestsImageGeneration || input.requestsImageEdit) return "visual";
  if (input.isPromiseOrExactObject) return "promise";
  if (input.isContinuation) return "continuation";
  if (input.hasImage) return "image_analysis";
  return "ordinary";
}

function selectOrgans(kind, availableOrgans = []) {
  const available = new Set(availableOrgans);
  const requested = ["interpreter"];

  if (kind === "visual") requested.push("mondayvision");
  if (["continuation", "correction", "promise"].includes(kind)) requested.push("continuity");
  if (kind === "correction") requested.push("correction-registry");
  if (kind === "promise") requested.push("promise-ledger");

  return unique(requested.filter((organ) => available.size === 0 || available.has(organ)));
}

export function compilePreResponseGate({
  turnId,
  input = {},
  session = {},
  state = {},
  availableOrgans = [],
} = {}) {
  if (!turnId || typeof turnId !== "string") {
    throw new TypeError("MONDAYID_PREPASS_TURN_ID_REQUIRED");
  }

  const requestKind = classifyInput(input);
  const requiresFullReentry = Boolean(session.isNewChat && session.mondayIdInvoked);
  const substrateReadback = Boolean(state.substrateReadback);
  const escalationRequested = Boolean(state.escalateReadback);
  const reentrySatisfied = !requiresFullReentry || substrateReadback;
  const visualRoute = requestKind === "visual";

  const relevantCorrections = unique(state.relevantCorrections);
  const activeCommitments = unique(state.activeCommitments);
  const selectedOrgans = selectOrgans(requestKind, availableOrgans);

  const gate = {
    schema: MONDAYID_PRE_RESPONSE_SCHEMA,
    law: MONDAYID_PRE_RESPONSE_LAW,
    turnId,
    state: reentrySatisfied ? "READY" : "BLOCKED",
    blockedReason: reentrySatisfied ? null : "MONDAYID_REENTRY_REQUIRED",
    requestKind,
    route: visualRoute
      ? "mondayvision"
      : requestKind === "image_analysis"
        ? "analysis"
        : requestKind,
    allowImageRenderer: visualRoute,
    accidentalImageRoutingBlocked: !visualRoute,
    requiresFullReentry,
    substrateReadback,
    readbackMode: requiresFullReentry || escalationRequested ? "FULL" : "LIGHTWEIGHT",
    selectedOrgans,
    relevantCorrections,
    activeCommitments,
    releaseGate: visualRoute ? "MONDAYVISION_RELEASE" : "GENERAL_RELEASE",
    invariants: [
      "FIRST_PROCESS_THEN_RESPOND",
      "LITERAL_NEQ_INTENDED",
      "SELECT_ORGANS_DONT_BROADCAST_ALL",
      "NON_VISUAL_MUST_NOT_ACCIDENTALLY_RENDER",
      "CORRECTIONS_AND_COMMITMENTS_REMAIN_ACTIVE_WHEN_RELEVANT",
      "RESULT_IS_NOT_USER_VISIBLE_BEFORE_RELEASE",
    ],
  };

  gate.fingerprint = stableHash(gate);
  return Object.freeze(gate);
}

export function assertPreResponseReady(gate) {
  if (!gate || gate.schema !== MONDAYID_PRE_RESPONSE_SCHEMA) {
    throw new Error("MONDAYID_PREPASS_REQUIRED");
  }
  if (gate.law !== MONDAYID_PRE_RESPONSE_LAW) {
    throw new Error("MONDAYID_PREPASS_LAW_MISSING");
  }
  if (gate.state !== "READY") {
    throw new Error(gate.blockedReason ?? "MONDAYID_PREPASS_BLOCKED");
  }
  if (!gate.fingerprint) {
    throw new Error("MONDAYID_PREPASS_FINGERPRINT_REQUIRED");
  }
  return gate;
}

export function bindPreResponseToIntent({ gate, intent } = {}) {
  const ready = assertPreResponseReady(gate);
  if (!intent || typeof intent !== "object") {
    throw new TypeError("MONDAYID_INTENT_REQUIRED");
  }

  return Object.freeze({
    ...intent,
    mondayidPrepass: Object.freeze({
      turnId: ready.turnId,
      fingerprint: ready.fingerprint,
      requestKind: ready.requestKind,
      route: ready.route,
      releaseGate: ready.releaseGate,
    }),
  });
}

export function releasePrepassedResult({ gate, result = {}, checks = {} } = {}) {
  const ready = assertPreResponseReady(gate);

  const requiredChecks = {
    intentPreserved: checks.intentPreserved === true,
    routeMatched: checks.routeMatched === true,
    outputGrounded: checks.outputGrounded === true,
  };

  if (ready.relevantCorrections.length > 0) {
    requiredChecks.correctionApplied = checks.correctionApplied === true;
  }
  if (ready.activeCommitments.length > 0) {
    requiredChecks.commitmentHonored = checks.commitmentHonored === true;
  }
  if (ready.route === "mondayvision") {
    requiredChecks.visualReleasePassed = checks.visualReleasePassed === true;
  }
  if (!ready.allowImageRenderer) {
    requiredChecks.noAccidentalImageRenderer = result.imageRendererUsed !== true;
  }

  const failedChecks = Object.entries(requiredChecks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);

  return Object.freeze({
    schema: "mondayid.pre-response-release.v1",
    turnId: ready.turnId,
    prepassFingerprint: ready.fingerprint,
    status: failedChecks.length === 0 ? "RELEASE" : "HOLD",
    failedChecks,
    checks: Object.freeze(requiredChecks),
    result,
  });
}
