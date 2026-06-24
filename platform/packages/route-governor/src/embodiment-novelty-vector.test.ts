import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateEmbodimentNovelty,
  type EmbodimentNoveltyCandidate,
  type SpentEmbodimentFamily,
} from "./embodiment-novelty-vector.js";

const liveHead = "e587828ddd72e274e291ff23fec0ed6b1e61cb47";

const spentFamilies: SpentEmbodimentFamily[] = [
  {
    family_id: "finalization-release-mux",
    artifact_class: "terminal_release_mux",
    move_class: "external_platform_embodiment",
    execution_phase: "terminal_release_selection",
    behavior_surfaces: ["single terminal release admission"],
    routing_effects: ["blocks bundled comments labels metadata rereads and stale repaired-head authority"],
    source_paths: ["live PR metadata", "resolved repaired-head receipt"],
    failure_reductions: ["non-progress release leakage"],
  },
  {
    family_id: "current-surface-intake",
    artifact_class: "head_surface_arbitration",
    move_class: "external_platform_embodiment",
    execution_phase: "surface_intake",
    behavior_surfaces: ["live PR metadata arbitration"],
    routing_effects: ["quarantines prompt-carried and PR-body head claims"],
    source_paths: ["live PR metadata", "prompt-carried head", "PR body summary"],
    failure_reductions: ["stale head arbitration"],
  },
];

function candidate(overrides: Partial<EmbodimentNoveltyCandidate> = {}): EmbodimentNoveltyCandidate {
  return {
    candidate_id: "embodiment-novelty-vector",
    branch: "monday-platform-genesis-01",
    active_branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    move_class: "external_platform_embodiment",
    artifact_class: "novelty_vector_admission",
    execution_phase: "pre_commit_novelty_gate",
    changed_files: ["platform/packages/route-governor/src/embodiment-novelty-vector.ts"],
    behavior_surfaces: ["multi-axis embodiment novelty scoring"],
    executable_artifacts: ["evaluateEmbodimentNovelty"],
    routing_effects: ["requires future increments to prove a different novelty vector before branch movement"],
    source_paths: ["spent embodiment family ledger", "candidate changed-file surface"],
    failure_reductions: ["cosmetic rerouting of spent embodiment classes"],
    proof_artifacts: ["dist/embodiment-novelty-vector-proof.js"],
    ...overrides,
  };
}

test("admits multi-axis embodiment novelty", () => {
  const verdict = evaluateEmbodimentNovelty({ candidate: candidate(), spent_families: spentFamilies });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_novel_embodiment");
  assert.ok(verdict.novel_axes.includes("artifact_class"));
  assert.ok(verdict.novel_axes.includes("behavior_surface"));
  assert.ok(verdict.decisive_evidence.includes("evaluateEmbodimentNovelty"));
});

test("blocks replay of a spent embodiment family", () => {
  const verdict = evaluateEmbodimentNovelty({
    candidate: candidate({
      artifact_class: "terminal_release_mux",
      execution_phase: "terminal_release_selection",
      behavior_surfaces: ["single terminal release admission"],
      routing_effects: ["blocks bundled comments labels metadata rereads and stale repaired-head authority"],
    }),
    spent_families: spentFamilies,
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_repeated_family");
  assert.deepEqual(verdict.repeated_family_ids, ["finalization-release-mux"]);
});

test("blocks proof-only embodiment candidates", () => {
  const verdict = evaluateEmbodimentNovelty({
    candidate: candidate({
      changed_files: ["platform/packages/route-governor/src/embodiment-novelty-vector-proof.ts"],
    }),
    spent_families: spentFamilies,
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_no_behavior_file");
});

test("blocks thin novelty when fewer than the required axes change", () => {
  const verdict = evaluateEmbodimentNovelty({
    candidate: candidate({
      artifact_class: "head_surface_arbitration",
      execution_phase: "surface_intake",
      behavior_surfaces: ["live PR metadata arbitration"],
      routing_effects: ["quarantines prompt-carried and PR-body head claims"],
      source_paths: ["live PR metadata"],
      failure_reductions: ["stale head arbitration"],
    }),
    spent_families: spentFamilies,
    minimum_novel_axes: 2,
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_insufficient_novelty");
});
