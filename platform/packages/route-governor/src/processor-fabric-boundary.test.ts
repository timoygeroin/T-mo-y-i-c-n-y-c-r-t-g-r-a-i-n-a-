import test from "node:test";
import assert from "node:assert/strict";
import { admitProcessorFabricBoundary, type ProcessorFabricBoundaryInput } from "./processor-fabric-boundary.js";

function input(overrides: Partial<ProcessorFabricBoundaryInput> = {}): ProcessorFabricBoundaryInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: "live-head",
    spent_candidate_ids: [],
    existing_package_boundaries: [],
    candidate: {
      candidate_id: "processor-fabric-boundary-1",
      branch: "monday-platform-genesis-01",
      base_head_sha: "live-head",
      package_boundary: "platform/packages/processor-fabric",
      changed_files: [
        "platform/packages/processor-fabric/package.json",
        "platform/packages/processor-fabric/src/index.ts",
        "platform/packages/route-governor/src/processor-fabric-boundary.ts",
      ],
      executable_artifacts: ["compileProcessorFabric"],
      routing_artifacts: ["processor fabric package boundary"],
      proof_artifacts: ["runProcessorFabricProof"],
    },
    ...overrides,
  };
}

test("admits a new processor fabric package boundary", () => {
  const verdict = admitProcessorFabricBoundary(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_processor_fabric_boundary");
  assert.equal(verdict.admitted_package_boundary, "platform/packages/processor-fabric");
  assert.match(verdict.next_route, /moved resulting head/);
});

test("blocks candidates based on stale heads", () => {
  const verdict = admitProcessorFabricBoundary(
    input({ candidate: { ...input().candidate, base_head_sha: "old-head" } }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_head_mismatch");
});

test("blocks already spent boundary candidates", () => {
  const verdict = admitProcessorFabricBoundary(input({ spent_candidate_ids: ["processor-fabric-boundary-1"] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_spent_boundary");
});

test("blocks already existing package boundaries", () => {
  const verdict = admitProcessorFabricBoundary(input({ existing_package_boundaries: ["platform/packages/processor-fabric"] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_package_boundary");
});

test("blocks proof-only candidates", () => {
  const verdict = admitProcessorFabricBoundary(
    input({
      candidate: {
        ...input().candidate,
        changed_files: ["platform/packages/processor-fabric/src/index-proof.ts"],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_boundary");
  assert.match(verdict.blockers.join("; "), /behavior-bearing/);
});
