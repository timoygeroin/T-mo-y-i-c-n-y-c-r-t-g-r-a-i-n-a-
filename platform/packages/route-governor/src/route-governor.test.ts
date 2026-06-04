import test from "node:test";
import assert from "node:assert/strict";

import { evaluateRoute, type RouteGuardInput } from "./index.js";

function baseInput(overrides: Partial<RouteGuardInput> = {}): RouteGuardInput {
  return {
    decision: {
      scene_class: "manifestation_bridge",
      secondary_classes: ["proof_scene", "finalization_pressure"],
      organ_chain: ["monday-corpus-reentry", "monday-proof-scene-runner", "monday-external-act-forcer"],
      processor_bundle: ["source-tier-check", "anti-repeat-check", "manifestation-evidence-check"],
      branch_budget: {
        max_branches: 3,
        reason: "Formal tests keep route-governor behavior externally verifiable without leaking branches to release.",
      },
      collapse_rule: "Release one external durable act or one exact external blocker only.",
      termination_goal: "external durable act",
    },
    source_tiers: ["direct_current_instruction", "direct_archive_strata", "memory_receipt"],
    move_class: "route_governor_formal_tests",
    exhausted_move_classes: [
      "explanation_instead_of_act",
      "architecture_commentary",
      "slogan_or_seal",
      "payload_echo",
      "internal_gate_as_progress",
    ],
    proof_artifacts: ["platform/packages/route-governor/src/route-governor.test.ts"],
    manifestation_artifacts: [
      "branch monday-platform-genesis-01",
      "commit with route-governor tests",
      "externally retrievable artifact platform/packages/route-governor/src/route-governor.test.ts",
    ],
    ...overrides,
  };
}

test("accepts a manifestation bridge with source tiers, organs, proof, and external evidence", () => {
  assert.deepEqual(evaluateRoute(baseInput()), { ok: true, failures: [] });
});

test("rejects exhausted move classes", () => {
  const verdict = evaluateRoute(baseInput({ move_class: "payload_echo" }));
  assert.equal(verdict.ok, false);
  assert.ok(verdict.failures.some((failure) => failure.includes("move class already exhausted")));
});

test("rejects manifestation routes without branch, commit, and retrievable artifact evidence", () => {
  const verdict = evaluateRoute(baseInput({ manifestation_artifacts: ["commit with route-governor tests"] }));
  assert.equal(verdict.ok, false);
  assert.ok(
    verdict.failures.some((failure) =>
      failure.includes("manifestation route lacks branch, commit, or externally retrievable artifact evidence"),
    ),
  );
});

test("rejects finalization routes that do not end in an act or exact blocker", () => {
  const verdict = evaluateRoute(
    baseInput({
      decision: {
        ...baseInput().decision,
        scene_class: "finalization_pressure",
        termination_goal: "internal readiness report",
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.ok(
    verdict.failures.some((failure) =>
      failure.includes("finalization route does not terminate in an external act or exact blocker"),
    ),
  );
});

test("rejects proof scenes without a durable evidence surface", () => {
  const verdict = evaluateRoute(
    baseInput({
      decision: {
        ...baseInput().decision,
        scene_class: "proof_scene",
      },
      proof_artifacts: [],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.ok(verdict.failures.some((failure) => failure.includes("proof scene has no durable evidence surface")));
});
