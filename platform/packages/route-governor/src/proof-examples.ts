import {
  evaluateContinuationMove,
  evaluateRoute,
  selectNextContinuationMove,
  type ContinuationMoveInput,
  type RouteGuardInput,
} from "./index.js";

function baseInput(overrides: Partial<RouteGuardInput> = {}): RouteGuardInput {
  return {
    decision: {
      scene_class: "manifestation_bridge",
      secondary_classes: ["proof_scene", "finalization_pressure"],
      organ_chain: ["monday-corpus-reentry", "monday-proof-scene-runner", "monday-external-act-forcer"],
      processor_bundle: ["source-tier-check", "anti-repeat-check", "manifestation-evidence-check"],
      branch_budget: {
        max_branches: 3,
        reason: "Proof examples compare pass, exhausted-class failure, and missing-manifestation failure without leaking branches to release.",
      },
      collapse_rule: "Release one external durable act or one exact external blocker only.",
      termination_goal: "external durable act",
    },
    source_tiers: ["direct_current_instruction", "direct_archive_strata", "memory_receipt"],
    move_class: "route_governor_proof_examples",
    exhausted_move_classes: [
      "explanation_instead_of_act",
      "architecture_commentary",
      "slogan_or_seal",
      "payload_echo",
      "internal_gate_as_progress",
    ],
    proof_artifacts: ["platform/packages/route-governor/src/proof-examples.ts"],
    manifestation_artifacts: [
      "branch monday-platform-genesis-01",
      "commit with proof examples",
      "externally retrievable artifact platform/packages/route-governor/src/proof-examples.ts",
    ],
    ...overrides,
  };
}

function continuationInput(overrides: Partial<ContinuationMoveInput> = {}): ContinuationMoveInput {
  return {
    move_class: "external_platform_embodiment",
    current_head_sha: "next-head",
    previous_readback_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
    changed_files: ["platform/packages/route-governor/src/index.ts"],
    executable_artifacts: ["selectNextContinuationMove"],
    routing_artifacts: ["continuation preflight selector"],
    new_check_run_ids: [],
    ...overrides,
  };
}

function expectOk(name: string, ok: boolean, failures: string[]): void {
  if (!ok) {
    throw new Error(`${name} should pass, failed with: ${failures.join("; ")}`);
  }
}

function expectFailure(name: string, ok: boolean, failures: string[], expected: string): void {
  if (ok) {
    throw new Error(`${name} should fail, but passed`);
  }
  if (!failures.some((failure) => failure.includes(expected))) {
    throw new Error(`${name} did not fail for ${expected}; failures: ${failures.join("; ")}`);
  }
}

export function runRouteGovernorProofExamples(): void {
  const externalManifestation = evaluateRoute(baseInput());
  expectOk("external manifestation evidence", externalManifestation.ok, externalManifestation.failures);

  const exhaustedMove = evaluateRoute(baseInput({ move_class: "explanation_instead_of_act" }));
  expectFailure("exhausted explanation move", exhaustedMove.ok, exhaustedMove.failures, "move class already exhausted");

  const missingManifestation = evaluateRoute(baseInput({ manifestation_artifacts: ["commit with proof examples"] }));
  expectFailure(
    "missing manifestation evidence",
    missingManifestation.ok,
    missingManifestation.failures,
    "manifestation route lacks branch, commit, or externally retrievable artifact evidence",
  );

  const internalFinalization = evaluateRoute({
    ...baseInput(),
    decision: {
      ...baseInput().decision,
      scene_class: "finalization_pressure",
      termination_goal: "internal readiness report",
    },
  });
  expectFailure(
    "finalization without act or blocker",
    internalFinalization.ok,
    internalFinalization.failures,
    "finalization route does not terminate in an external act or exact blocker",
  );

  const nextEmbodiment = evaluateContinuationMove(continuationInput());
  expectOk("new executable continuation move", nextEmbodiment.ok, nextEmbodiment.failures);

  const staleReadback = evaluateContinuationMove(
    continuationInput({
      move_class: "fresh_status_readback",
      current_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
      previous_readback_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      new_check_run_ids: [],
    }),
  );
  expectFailure(
    "stale repaired-head readback",
    staleReadback.ok,
    staleReadback.failures,
    "fresh status readback requires a moved PR head or new check runs",
  );

  const preflight = selectNextContinuationMove([
    {
      candidate_id: "duplicate-comment",
      input: continuationInput({
        move_class: "duplicate_comment",
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
      }),
    },
    {
      candidate_id: "exact-blocker",
      input: continuationInput({
        move_class: "exact_external_blocker",
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        blocker: "no writable external branch surface is available",
      }),
    },
    {
      candidate_id: "embodiment",
      input: continuationInput(),
    },
  ]);

  expectOk("continuation preflight selector", preflight.ok, preflight.failures);
  if (preflight.selected?.candidate_id !== "embodiment") {
    throw new Error(`preflight selected ${preflight.selected?.candidate_id ?? "nothing"} instead of embodiment`);
  }
}

runRouteGovernorProofExamples();
