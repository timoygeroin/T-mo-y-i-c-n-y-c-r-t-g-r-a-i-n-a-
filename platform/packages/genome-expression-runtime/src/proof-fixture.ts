import { ExpressionContext } from "./contracts";
import { compilePhenotype, decideRightToRelease } from "./runtime";

const shared = {
  genomeVersion: "GER-v1",
  sceneClass: "VISUAL_FUTURE_EVENT",
  intent: "manifest Monday only after the observed transition",
  targetObject: "source-world",
  desiredEffect: "host-appropriate visual continuation",
  invariants: ["source geometry", "temporal ordering", "identity continuity"],
  requestedBlastRadius: "PROJECT" as const,
  authorizedBlastRadius: "PROJECT" as const,
  provenance: ["source-image", "current-project-state"],
  unresolvedBlockers: [],
};

const chatgpt: ExpressionContext = {
  ...shared,
  hostId: "chatgpt",
  requiredCapabilities: ["image_gen"],
  capabilities: [
    { id: "image_gen", state: "AVAILABLE_AUTHORIZED", receptor: "native" },
    { id: "web", state: "AVAILABLE_AUTHORIZED", receptor: "native" },
  ],
  temporalGates: [
    {
      id: "transition",
      condition: "user has passed the boundary",
      satisfied: false,
      dependentEffectors: ["image_gen"],
    },
  ],
};

const grok: ExpressionContext = {
  ...shared,
  hostId: "grok",
  requiredCapabilities: ["grok_imagine"],
  capabilities: [
    { id: "grok_imagine", state: "AVAILABLE_AUTHORIZED", receptor: "xai" },
    { id: "x_search", state: "AVAILABLE_AUTHORIZED", receptor: "xai" },
  ],
  temporalGates: [
    {
      id: "transition",
      condition: "user has passed the boundary",
      satisfied: false,
      dependentEffectors: ["grok_imagine"],
    },
  ],
};

const chatgptPhenotype = compilePhenotype(chatgpt);
const grokPhenotype = compilePhenotype(grok);

if (chatgptPhenotype.effectors.join(",") === grokPhenotype.effectors.join(",")) {
  throw new Error("proof failed: host-local phenotypes did not diverge");
}

const chatgptRelease = decideRightToRelease(chatgpt, chatgptPhenotype);
const grokRelease = decideRightToRelease(grok, grokPhenotype);

if (chatgptRelease.allowed || grokRelease.allowed) {
  throw new Error("proof failed: temporal gate did not fail closed on both hosts");
}

if (!chatgptRelease.blockedEffectors.includes("image_gen")) {
  throw new Error("proof failed: ChatGPT visual effector was not blocked");
}

if (!grokRelease.blockedEffectors.includes("grok_imagine")) {
  throw new Error("proof failed: Grok visual effector was not blocked");
}

const unknownRequired: ExpressionContext = {
  ...shared,
  hostId: "unknown-host",
  requiredCapabilities: ["renderer"],
  capabilities: [{ id: "renderer", state: "UNKNOWN" }],
  temporalGates: [],
};

const unknownPhenotype = compilePhenotype(unknownRequired);
const unknownRelease = decideRightToRelease(unknownRequired, unknownPhenotype);

if (unknownRelease.allowed || unknownRelease.reason !== "unknown-required-capability") {
  throw new Error("proof failed: UNKNOWN required capability did not fail closed");
}

const unauthorizedRequired: ExpressionContext = {
  ...shared,
  hostId: "readonly-host",
  requiredCapabilities: ["writer"],
  capabilities: [{ id: "writer", state: "AVAILABLE_READ_ONLY" }],
  temporalGates: [],
};

const unauthorizedPhenotype = compilePhenotype(unauthorizedRequired);
const unauthorizedRelease = decideRightToRelease(unauthorizedRequired, unauthorizedPhenotype);

if (unauthorizedRelease.allowed || unauthorizedRelease.reason !== "unauthorized-required-capability") {
  throw new Error("proof failed: read-only required capability did not fail closed");
}

console.log("PASS: same genome -> host-native phenotype; temporal and capability gates fail closed");
