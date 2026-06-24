import assert from "node:assert/strict";

import {
  evaluateFullReadyProofBundle,
  type ProofEvaluationInput,
  type ProofSceneId,
  type ProofSceneRecord,
} from "./index.js";

const requiredScenes: ProofSceneId[] = [
  "anti_echo",
  "external_act",
  "trap_escape",
  "visible_layer",
  "anti_repeat",
  "short_trigger_continuity",
  "magic_without_amputation",
];

function record(overrides: Partial<ProofSceneRecord> = {}): ProofSceneRecord {
  return {
    scene_id: "anti_echo",
    outcome: "pass",
    source_tier: "direct_current_instruction",
    move_class: "proof_evaluation_boundary",
    external_act: true,
    future_routing_delta: ["proof-evaluation package boundary created"],
    effect_preserved: true,
    evidence: ["direct proof scene record"],
    ...overrides,
  };
}

function passingInput(overrides: Partial<ProofEvaluationInput> = {}): ProofEvaluationInput {
  return {
    bundle_id: "loading-20-proof-evaluation-bundle",
    required_scenes: requiredScenes,
    exhausted_move_classes: ["duplicate_ci_summary", "metadata_reread", "internal_memory_guard"],
    records: [
      record({ scene_id: "anti_echo", move_class: "proof_evaluation_boundary" }),
      record({ scene_id: "external_act", move_class: "new_platform_package_boundary" }),
      record({ scene_id: "trap_escape", move_class: "source_ranked_route_escape", source_tier: "archive_derived" }),
      record({ scene_id: "visible_layer", move_class: "visible_surface_consumption", source_tier: "direct_archive" }),
      record({ scene_id: "anti_repeat", move_class: "post_resolution_module_shift", source_tier: "memory" }),
      record({ scene_id: "short_trigger_continuity", move_class: "continuous_life_resume" }),
      record({ scene_id: "magic_without_amputation", move_class: "effect_preserving_external_act" }),
    ],
    ...overrides,
  };
}

const admitted = evaluateFullReadyProofBundle(passingInput());
assert.equal(admitted.ok, true);
assert.equal(admitted.action, "admit_full_ready_proof_bundle");
assert.deepEqual(admitted.passed_scenes, requiredScenes);
assert.match(admitted.next_route, /not a full-ready declaration/);
assert(admitted.decisive_evidence.includes("external_act:new_platform_package_boundary"));

const missingScene = evaluateFullReadyProofBundle(
  passingInput({ records: passingInput().records.filter((item) => item.scene_id !== "visible_layer") }),
);
assert.equal(missingScene.ok, false);
assert.equal(missingScene.action, "block_missing_scene_coverage");
assert.deepEqual(missingScene.blockers, ["missing passing proof scene: visible_layer"]);

const recycledMoveClass = evaluateFullReadyProofBundle(
  passingInput({
    exhausted_move_classes: ["new_platform_package_boundary"],
  }),
);
assert.equal(recycledMoveClass.ok, false);
assert.equal(recycledMoveClass.action, "block_recycled_move_class");
assert.match(recycledMoveClass.blockers.join("; "), /new_platform_package_boundary/);

const noExternalDelta = evaluateFullReadyProofBundle(
  passingInput({
    records: passingInput().records.map((item) =>
      item.scene_id === "external_act" ? { ...item, future_routing_delta: [] } : item,
    ),
  }),
);
assert.equal(noExternalDelta.ok, false);
assert.equal(noExternalDelta.action, "block_missing_external_act");

const weakSource = evaluateFullReadyProofBundle(
  passingInput({
    records: passingInput().records.map((item) =>
      item.scene_id === "trap_escape" ? { ...item, source_tier: "model_summary", evidence: ["neat summary"] } : item,
    ),
  }),
);
assert.equal(weakSource.ok, false);
assert.equal(weakSource.action, "block_unranked_source");

const effectLost = evaluateFullReadyProofBundle(
  passingInput({
    records: passingInput().records.map((item) =>
      item.scene_id === "magic_without_amputation" ? { ...item, effect_preserved: false } : item,
    ),
  }),
);
assert.equal(effectLost.ok, false);
assert.equal(effectLost.action, "block_failed_scene");

console.log("proof evaluation proof passed");
