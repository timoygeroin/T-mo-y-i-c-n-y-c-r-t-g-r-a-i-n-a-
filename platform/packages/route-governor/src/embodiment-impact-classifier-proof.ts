import assert from "node:assert/strict";

import { classifyEmbodimentImpact, type EmbodimentImpactCandidate } from "./embodiment-impact-classifier.js";

function candidate(overrides: Partial<EmbodimentImpactCandidate> = {}): EmbodimentImpactCandidate {
  return {
    candidate_id: "behavior-bearing-impact-classifier",
    branch: "monday-platform-genesis-01",
    active_branch: "monday-platform-genesis-01",
    live_head_sha: "next-head",
    requested_move_class: "external_platform_embodiment",
    artifact_class: "embodiment_impact_classifier",
    changed_files: ["platform/packages/route-governor/src/embodiment-impact-classifier.ts"],
    executable_artifacts: ["classifyEmbodimentImpact"],
    routing_artifacts: ["blocks proof-only movement from counting as embodiment progress"],
    proof_artifacts: ["dist/embodiment-impact-classifier-proof.js"],
    behavior_surfaces: ["future continuation candidates must expose non-proof executable behavior"],
    spent_artifact_classes: ["head_transition_lineage_guard", "post_readback_embodiment_planner"],
    ...overrides,
  };
}

const accepted = classifyEmbodimentImpact(candidate());
assert.equal(accepted.ok, true);
assert.equal(accepted.action, "accept_behavior_increment");
assert.ok(accepted.decisive_evidence.includes("platform/packages/route-governor/src/embodiment-impact-classifier.ts"));

const proofOnly = classifyEmbodimentImpact(
  candidate({ changed_files: ["platform/packages/route-governor/src/embodiment-impact-classifier-proof.ts"] }),
);
assert.equal(proofOnly.ok, false);
assert.equal(proofOnly.action, "block_proof_only_change");

const repeated = classifyEmbodimentImpact(candidate({ artifact_class: "post_readback_embodiment_planner" }));
assert.equal(repeated.ok, false);
assert.equal(repeated.action, "block_repeated_artifact_class");

console.log("embodiment impact classifier proof passed");
