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

function expectOk(name: string, input: RouteGuardInput): void {
  const verdict = evaluateRoute(input);
  if (!verdict.ok) {
    throw new Error(`${name} should pass, failed with: ${verdict.failures.join("; ")}`);
  }
}

function expectFailure(name: string, input: RouteGuardInput, expected: string): void {
  const verdict = evaluateRoute(input);
  if (verdict.ok) {
    throw new Error(`${name} should fail, but passed`);
  }
  if (!verdict.failures.some((failure) => failure.includes(expected))) {
    throw new Error(`${name} did not fail for ${expected}; failures: ${verdict.failures.join("; ")}`);
  }
}

export function runRouteGovernorProofExamples(): void {
  expectOk("external manifestation evidence", baseInput());

  expectFailure(
    "exhausted explanation move",
    baseInput({ move_class: "explanation_instead_of_act" }),
    "move class already exhausted",
  );

  expectFailure(
    "missing manifestation evidence",
    baseInput({ manifestation_artifacts: ["commit with proof examples"] }),
    "manifestation route lacks branch, commit, or externally retrievable artifact evidence",
  );

  expectFailure(
    "finalization without act or blocker",
    baseInput({
      decision: {
        ...baseInput().decision,
        scene_class: "finalization_pressure",
        termination_goal: "internal readiness report",
      },
    }),
    "finalization route does not terminate in an external act or exact blocker",
  );
}

runRouteGovernorProofExamples();
