import assert from "node:assert/strict";
import { test } from "node:test";

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

test("accepts non-repeated executable behavior-bearing embodiment", () => {
  const verdict = classifyEmbodimentImpact(candidate());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "accept_behavior_increment");
  assert.deepEqual(verdict.failures, []);
  assert.ok(verdict.decisive_evidence.includes("classifyEmbodimentImpact"));
  assert.ok(verdict.decisive_evidence.includes("future continuation candidates must expose non-proof executable behavior"));
});

test("blocks fresh status readback from being counted as embodiment", () => {
  const verdict = classifyEmbodimentImpact(candidate({ requested_move_class: "fresh_status_readback" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_embodiment_move");
  assert.ok(verdict.failures.some((failure) => failure.includes("fresh_status_readback")));
});

test("blocks repeated artifact classes", () => {
  const verdict = classifyEmbodimentImpact(
    candidate({
      artifact_class: "post_readback_embodiment_planner",
      changed_files: ["platform/packages/route-governor/src/embodiment-increment.ts"],
      executable_artifacts: ["evaluateEmbodimentIncrement"],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_repeated_artifact_class");
  assert.ok(verdict.failures.some((failure) => failure.includes("already spent")));
});

test("blocks documentation-only changes", () => {
  const verdict = classifyEmbodimentImpact(candidate({ changed_files: ["platform/docs/manifestation-contract.md"] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_executable_change");
});

test("blocks proof-only executable changes", () => {
  const verdict = classifyEmbodimentImpact(
    candidate({ changed_files: ["platform/packages/route-governor/src/embodiment-impact-classifier-proof.ts"] }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_proof_only_change");
});

test("blocks behaviorless executable wiring", () => {
  const verdict = classifyEmbodimentImpact(candidate({ behavior_surfaces: [] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_behavior_surface");
});
