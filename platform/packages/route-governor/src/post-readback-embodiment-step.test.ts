import test from "node:test";
import assert from "node:assert/strict";

import { compilePostReadbackEmbodimentStep } from "./post-readback-embodiment-step.js";
import type { ContinuationMoveInput, ContinuationStatusReceiptSurface } from "./index.js";

const head = "ce2b0e8868a011c1260b4137232d36533e2ca5cb";
const branch = "monday-platform-genesis-01";

const passingStatus: ContinuationStatusReceiptSurface = {
  verdict: "passing_with_warnings",
  ok: true,
  decisive_successes: ["Route Governor Proof / proof examples: success"],
  blocking_failures: [],
  pending_surfaces: [],
  non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
};

function move(overrides: Partial<ContinuationMoveInput> = {}): ContinuationMoveInput {
  return {
    move_class: "external_platform_embodiment",
    current_head_sha: head,
    previous_readback_head_sha: head,
    changed_files: ["platform/packages/route-governor/src/post-readback-embodiment-step.ts"],
    executable_artifacts: ["compilePostReadbackEmbodimentStep"],
    routing_artifacts: ["post-readback embodiment compiler"],
    new_check_run_ids: [],
    ...overrides,
  };
}

test("selects executable embodiment after repaired-head readback instead of duplicate status work", () => {
  const verdict = compilePostReadbackEmbodimentStep({
    branch,
    current_head_sha: head,
    resolved_readback_head_sha: head,
    status_surface: passingStatus,
    candidates: [
      { candidate_id: "duplicate-comment", input: move({ move_class: "duplicate_comment", changed_files: [], executable_artifacts: [], routing_artifacts: [] }) },
      { candidate_id: "status-loop", input: move({ move_class: "fresh_status_readback", changed_files: [], executable_artifacts: [], routing_artifacts: [] }) },
      { candidate_id: "embodiment", input: move() },
    ],
  });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.release_instruction, "commit_external_embodiment");
  assert.equal(verdict.selected_candidate_id, "embodiment");
  assert.deepEqual(verdict.blockers, []);
  assert.equal(verdict.rejected.length, 2);
  assert.deepEqual(verdict.warnings, ["Node.js 20 Actions deprecation notice"]);
});

test("routes to current-head status readback when the PR head moved", () => {
  const verdict = compilePostReadbackEmbodimentStep({
    branch,
    current_head_sha: "new-head",
    resolved_readback_head_sha: head,
    candidates: [{ candidate_id: "embodiment", input: move({ current_head_sha: "new-head" }) }],
  });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.release_class, "fresh_status_readback");
  assert.equal(verdict.release_instruction, "read_current_head_status");
  assert.deepEqual(verdict.decisive_evidence, [`head moved from ${head} to new-head`]);
});

test("blocks embodiment release while current-head checks are pending", () => {
  const verdict = compilePostReadbackEmbodimentStep({
    branch,
    current_head_sha: head,
    resolved_readback_head_sha: head,
    status_surface: {
      verdict: "pending",
      ok: false,
      decisive_successes: [],
      blocking_failures: [],
      pending_surfaces: ["PR Head Status Readback / Read PR head status"],
      non_blocking_warnings: [],
    },
    candidates: [{ candidate_id: "embodiment", input: move() }],
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.release_instruction, "block_release");
  assert.deepEqual(verdict.blockers, ["PR Head Status Readback / Read PR head status"]);
  assert.equal(verdict.next_route, "wait for current-head checks to complete");
});

test("emits an exact blocker when no executable embodiment can be produced", () => {
  const verdict = compilePostReadbackEmbodimentStep({
    branch,
    current_head_sha: head,
    resolved_readback_head_sha: head,
    candidates: [
      {
        candidate_id: "blocker",
        input: move({
          move_class: "exact_external_blocker",
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          blocker: "no writable external branch surface is available",
        }),
      },
    ],
  });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.release_instruction, "emit_exact_blocker");
  assert.deepEqual(verdict.blockers, ["no writable external branch surface is available"]);
});

test("rejects embodiment candidates that do not change executable platform files", () => {
  const verdict = compilePostReadbackEmbodimentStep({
    branch,
    current_head_sha: head,
    resolved_readback_head_sha: head,
    candidates: [{ candidate_id: "docs-only", input: move({ changed_files: ["platform/docs/full-ready-continuation-checkpoint.md"] }) }],
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.release_instruction, "block_release");
  assert.deepEqual(verdict.rejected, [
    {
      candidate_id: "docs-only",
      reasons: ["external embodiment candidate has no executable platform file change"],
    },
  ]);
});
