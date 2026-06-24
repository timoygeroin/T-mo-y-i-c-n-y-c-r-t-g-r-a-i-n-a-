import assert from "node:assert/strict";
import test from "node:test";

import {
  intakeResolvedBoundarySuccessor,
  type ResolvedBoundarySuccessorCandidate,
  type ResolvedBoundarySuccessorIntakeInput,
} from "./resolved-boundary-successor-intake.js";

const branch = "monday-platform-genesis-01";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const successorHead = "0373377943c547345d2adb28ccd6692d3ebb883c";

function candidate(overrides: Partial<ResolvedBoundarySuccessorCandidate> = {}): ResolvedBoundarySuccessorCandidate {
  return {
    progress_class: "external_platform_embodiment",
    branch,
    base_head_sha: successorHead,
    changed_files: ["platform/packages/route-governor/src/resolved-boundary-successor-intake.ts"],
    executable_artifacts: ["intakeResolvedBoundarySuccessor"],
    routing_artifacts: ["resolved repaired-head authority retires when the live PR head is a successor"],
    proof_artifacts: ["platform/packages/route-governor/src/resolved-boundary-successor-intake.test.ts"],
    status_surface_ids: [],
    current_head_check_ids: [],
    ...overrides,
  };
}

function input(overrides: Partial<ResolvedBoundarySuccessorIntakeInput> = {}): ResolvedBoundarySuccessorIntakeInput {
  return {
    active_branch: branch,
    live_head_sha: successorHead,
    instruction_head_sha: repairedHead,
    resolved_repaired_head_sha: repairedHead,
    resolved_boundary_ids: ["issue-1-ci-status-readback-resolved"],
    last_status_readback_head_sha: repairedHead,
    candidate: candidate(),
    ...overrides,
  };
}

test("admits a successor-head external embodiment and retires repaired-head authority", () => {
  const verdict = intakeResolvedBoundarySuccessor(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_successor_external_embodiment");
  assert.equal(verdict.instruction_head_is_current, false);
  assert.ok(verdict.retired_head_shas.includes(repairedHead));
  assert.deepEqual(verdict.blockers, []);
  assert.ok(verdict.decisive_evidence.includes("intakeResolvedBoundarySuccessor"));
});

test("admits a fresh status readback when the live successor head moved past the repaired head", () => {
  const verdict = intakeResolvedBoundarySuccessor(
    input({
      candidate: candidate({
        progress_class: "fresh_status_readback",
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
      }),
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_successor_status_readback");
  assert.match(verdict.decisive_evidence.join("\n"), /head moved/);
});

test("blocks repaired-head status replay and duplicate summaries after the boundary is resolved", () => {
  for (const progress_class of ["repaired_head_status_readback", "duplicate_ci_summary"] as const) {
    const verdict = intakeResolvedBoundarySuccessor(
      input({
        candidate: candidate({
          progress_class,
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          proof_artifacts: [],
        }),
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_non_progress_class");
    assert.match(verdict.blockers.join("\n"), /non-progress/);
  }
});

test("blocks embodiment candidates based on the retired repaired head", () => {
  const verdict = intakeResolvedBoundarySuccessor(
    input({ candidate: candidate({ base_head_sha: repairedHead }) }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_successor_base");
  assert.ok(verdict.retired_head_shas.includes(repairedHead));
});

test("blocks proof-only successor embodiments", () => {
  const verdict = intakeResolvedBoundarySuccessor(
    input({
      candidate: candidate({
        changed_files: ["platform/packages/route-governor/src/resolved-boundary-successor-intake.test.ts"],
      }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_successor_embodiment");
  assert.ok(verdict.blockers.includes("successor embodiment changes no behavior-bearing platform file"));
});

test("emits one exact successor-head blocker when no embodiment or readback can proceed", () => {
  const blocker = "GitHub contents API rejected writes to monday-platform-genesis-01";
  const verdict = intakeResolvedBoundarySuccessor(
    input({
      candidate: candidate({
        progress_class: "exact_external_blocker",
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
        blocker,
      }),
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "emit_successor_exact_blocker");
  assert.deepEqual(verdict.blockers, [blocker]);
});
