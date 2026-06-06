import test from "node:test";
import assert from "node:assert/strict";

import { evaluateContinuationMove, evaluateRoute, type RouteGuardInput } from "./index.js";

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

test("allows a new external platform embodiment with executable and routing artifacts", () => {
  assert.deepEqual(
    evaluateContinuationMove({
      move_class: "external_platform_embodiment",
      current_head_sha: "next-head",
      previous_readback_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
      changed_files: ["platform/packages/route-governor/src/index.ts"],
      executable_artifacts: ["evaluateContinuationMove"],
      routing_artifacts: ["continuation move verdict"],
      new_check_run_ids: [],
    }),
    {
      ok: true,
      next_allowed_move: "commit_external_embodiment",
      reason: "move changes executable platform behavior and leaves a routing artifact",
      failures: [],
    },
  );
});

test("rejects duplicate repaired-head status readback when the head and check surface did not move", () => {
  const verdict = evaluateContinuationMove({
    move_class: "fresh_status_readback",
    current_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
    previous_readback_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
    changed_files: [],
    executable_artifacts: [],
    routing_artifacts: [],
    new_check_run_ids: [],
  });

  assert.equal(verdict.ok, false);
  assert.ok(verdict.failures.some((failure) => failure.includes("requires a moved PR head or new check runs")));
});

test("rejects metadata rereads and duplicate comments as continuation progress", () => {
  const verdict = evaluateContinuationMove({
    move_class: "metadata_reread",
    current_head_sha: "same-head",
    previous_readback_head_sha: "same-head",
    changed_files: [],
    executable_artifacts: [],
    routing_artifacts: [],
    new_check_run_ids: [],
  });

  assert.equal(verdict.ok, false);
  assert.ok(verdict.failures.some((failure) => failure.includes("explicitly non-progress")));
});
