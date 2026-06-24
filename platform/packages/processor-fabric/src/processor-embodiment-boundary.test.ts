import assert from "node:assert/strict";
import test from "node:test";

import {
  admitProcessorEmbodimentBoundary,
  type ProcessorEmbodimentBoundaryInput,
  type ProcessorEmbodimentCandidate,
} from "./processor-embodiment-boundary.js";

const branch = "monday-platform-genesis-01";
const liveHead = "post-resolution-live-head";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function candidate(overrides: Partial<ProcessorEmbodimentCandidate> = {}): ProcessorEmbodimentCandidate {
  return {
    boundary_id: "processor-boundary-01",
    progress_class: "external_platform_embodiment",
    branch,
    base_head_sha: liveHead,
    changed_files: ["platform/packages/processor-fabric/src/processor-embodiment-boundary.ts"],
    behavior_exports: ["admitProcessorEmbodimentBoundary"],
    routing_artifacts: ["post-resolution processor-fabric boundary admission"],
    proof_artifacts: ["platform/packages/processor-fabric/src/processor-embodiment-boundary-proof.ts"],
    processor_dispatch_ids: ["loading-20:processor:external-act"],
    convergence_receipts: ["source-authorized-convergence:external-act"],
    resolved_boundary_ids: ["issue-1-ci-status-readback"],
    ...overrides,
  };
}

function input(overrides: Partial<ProcessorEmbodimentBoundaryInput> = {}): ProcessorEmbodimentBoundaryInput {
  return {
    active_branch: branch,
    live_head_sha: liveHead,
    repaired_head_sha: repairedHead,
    spent_boundary_ids: [],
    spent_progress_classes: ["metadata_reread", "duplicate_ci_summary", "reclose_resolved_blocker"],
    candidate: candidate(),
    ...overrides,
  };
}

test("admits a processor-fabric embodiment after repaired-head boundary resolution", () => {
  const verdict = admitProcessorEmbodimentBoundary(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_processor_embodiment_boundary");
  assert.equal(verdict.boundary_id, "processor-boundary-01");
  assert.ok(verdict.quarantined_head_shas.includes(repairedHead));
  assert.deepEqual(verdict.blockers, []);
});

test("blocks stale bases and branch drift", () => {
  const stale = admitProcessorEmbodimentBoundary(input({ candidate: candidate({ base_head_sha: repairedHead }) }));
  const wrongBranch = admitProcessorEmbodimentBoundary(input({ candidate: candidate({ branch: "main" }) }));

  assert.equal(stale.ok, false);
  assert.equal(stale.action, "block_wrong_head");
  assert.equal(wrongBranch.ok, false);
  assert.equal(wrongBranch.action, "block_wrong_branch");
});

test("rejects duplicate status, metadata reread, and route-governor-only wrappers", () => {
  for (const progressClass of ["fresh_status_readback", "metadata_reread", "route_governor_only"] as const) {
    const verdict = admitProcessorEmbodimentBoundary(input({ candidate: candidate({ progress_class: progressClass }) }));

    assert.equal(verdict.ok, false);
    assert.ok(verdict.action === "block_non_progress_class" || verdict.action === "block_route_governor_only");
  }
});

test("requires processor dispatch and convergence receipts", () => {
  const noDispatch = admitProcessorEmbodimentBoundary(input({ candidate: candidate({ processor_dispatch_ids: [] }) }));
  const noConvergence = admitProcessorEmbodimentBoundary(input({ candidate: candidate({ convergence_receipts: [] }) }));

  assert.equal(noDispatch.ok, false);
  assert.equal(noDispatch.action, "block_missing_processor_dispatch");
  assert.equal(noConvergence.ok, false);
  assert.equal(noConvergence.action, "block_missing_convergence");
});

test("blocks proof-only processor changes", () => {
  const verdict = admitProcessorEmbodimentBoundary(
    input({
      candidate: candidate({
        changed_files: ["platform/packages/processor-fabric/src/processor-embodiment-boundary-proof.ts"],
      }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_boundary");
  assert.ok(verdict.blockers.includes("processor embodiment has no behavior-bearing processor-fabric file"));
});

test("admits an exact external blocker only when it is named", () => {
  const blocker = "GitHub contents API cannot create the processor-fabric boundary on the live branch";
  const missing = admitProcessorEmbodimentBoundary(
    input({ candidate: candidate({ progress_class: "exact_external_blocker", blocker: "" }) }),
  );
  const admitted = admitProcessorEmbodimentBoundary(
    input({ candidate: candidate({ progress_class: "exact_external_blocker", blocker }) }),
  );

  assert.equal(missing.ok, false);
  assert.equal(missing.action, "block_incomplete_boundary");
  assert.equal(admitted.ok, true);
  assert.equal(admitted.action, "emit_processor_boundary_blocker");
  assert.deepEqual(admitted.blockers, [blocker]);
});
