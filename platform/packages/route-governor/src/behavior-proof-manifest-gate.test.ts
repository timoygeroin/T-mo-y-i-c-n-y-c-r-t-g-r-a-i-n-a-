import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compileBehaviorProofManifestGate, type BehaviorProofManifestGateInput } from "./behavior-proof-manifest-gate.js";

function base(overrides: Partial<BehaviorProofManifestGateInput> = {}): BehaviorProofManifestGateInput {
  return {
    active_branch: "monday-platform-genesis-01",
    branch: "monday-platform-genesis-01",
    modules: [
      {
        module_id: "behavior-proof-manifest-gate",
        source_path: "platform/packages/route-governor/src/behavior-proof-manifest-gate.ts",
        behavior_exports: ["compileBehaviorProofManifestGate"],
        proof_paths: ["platform/packages/route-governor/src/behavior-proof-manifest-gate.test.ts"],
        required: true,
      },
    ],
    root_exports: ["compileBehaviorProofManifestGate"],
    proof_command: "tsc -p tsconfig.json && node dist/proof-examples.js",
    test_command: "tsc -p tsconfig.json && node --test dist/*.test.js",
    spent_module_ids: [],
    ...overrides,
  };
}

describe("compileBehaviorProofManifestGate", () => {
  it("accepts a behavior module with root export and test visibility", () => {
    const verdict = compileBehaviorProofManifestGate(base());

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "accept_behavior_proof_manifest_gate");
    assert.deepEqual(verdict.admitted_module_ids, ["behavior-proof-manifest-gate"]);
  });

  it("blocks hidden behavior exports", () => {
    const verdict = compileBehaviorProofManifestGate(base({ root_exports: [] }));

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "repair_behavior_proof_manifest_gate");
    assert.ok(verdict.blockers.some((blocker) => blocker.includes("behavior export missing from root index")));
  });

  it("blocks proof paths absent from proof and test commands", () => {
    const verdict = compileBehaviorProofManifestGate(base({ test_command: "tsc -p tsconfig.json" }));

    assert.equal(verdict.ok, false);
    assert.ok(verdict.blockers.some((blocker) => blocker.includes("behavior proof manifest path is not command-visible")));
  });

  it("blocks proof-only or index modules from counting as behavior", () => {
    const verdict = compileBehaviorProofManifestGate(
      base({
        modules: [
          {
            module_id: "proof-only",
            source_path: "platform/packages/route-governor/src/behavior-proof-manifest-gate-proof.ts",
            behavior_exports: ["runProof"],
            proof_paths: ["platform/packages/route-governor/src/behavior-proof-manifest-gate-proof.ts"],
            required: true,
          },
        ],
        root_exports: ["runProof"],
        proof_command: "node dist/behavior-proof-manifest-gate-proof.js",
      }),
    );

    assert.equal(verdict.ok, false);
    assert.ok(verdict.blockers.some((blocker) => blocker.includes("not a behavior source")));
  });
});
