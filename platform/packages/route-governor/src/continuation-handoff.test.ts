import test from "node:test";
import assert from "node:assert/strict";

import { compileContinuationHandoff } from "./continuation-handoff.js";
import type { ContinuationMoveInput, ContinuationStatusReceiptSurface } from "./index.js";

const branch = "monday-platform-genesis-01";
const head = "dd68b38e1d496ca39c8b9536f694880ad8300b88";
const priorHead = "06790fc3f0eb5fd05d614ae711d6567ac352d831";

const passingStatus: ContinuationStatusReceiptSurface = {
  verdict: "passing_with_warnings",
  ok: true,
  decisive_successes: ["Route Governor Proof / proof examples: success"],
  blocking_failures: [],
  pending_surfaces: [],
  non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
};

function candidate(overrides: Partial<ContinuationMoveInput> = {}): ContinuationMoveInput {
  return {
    move_class: "external_platform_embodiment",
    current_head_sha: head,
    previous_readback_head_sha: priorHead,
    changed_files: ["platform/packages/route-governor/src/continuation-handoff.ts"],
    executable_artifacts: ["compileContinuationHandoff"],
    routing_artifacts: ["continuation handoff compiler"],
    new_check_run_ids: [],
    ...overrides,
  };
}

test("routes moved heads to current-head status before allowing a claim", () => {
  const verdict = compileContinuationHandoff({
    branch,
    active_branch: branch,
    current_head_sha: head,
    last_released_head_sha: priorHead,
    candidates: [{ candidate_id: "embodiment", input: candidate() }],
  });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "read_current_head_status");
  assert.equal(verdict.status_claim_allowed, false);
  assert.deepEqual(verdict.decisive_evidence, [`head moved from ${priorHead} to ${head}`]);
});

test("selects executable embodiment once the current head has a passing status surface", () => {
  const verdict = compileContinuationHandoff({
    branch,
    active_branch: branch,
    current_head_sha: head,
    last_released_head_sha: head,
    status_surface: passingStatus,
    candidates: [
      {
        candidate_id: "duplicate-comment",
        input: candidate({ move_class: "duplicate_comment", changed_files: [], executable_artifacts: [], routing_artifacts: [] }),
      },
      { candidate_id: "handoff", input: candidate() },
    ],
  });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "commit_external_embodiment");
  assert.equal(verdict.status_claim_allowed, true);
  assert.equal(verdict.selected_candidate_id, "handoff");
  assert.deepEqual(verdict.warnings, ["Node.js 20 Actions deprecation notice"]);
  assert.deepEqual(verdict.rejected, [
    {
      candidate_id: "duplicate-comment",
      reasons: ["candidate repeats spent continuation class: duplicate_comment"],
    },
  ]);
});

test("blocks embodiment while current-head status is pending", () => {
  const verdict = compileContinuationHandoff({
    branch,
    active_branch: branch,
    current_head_sha: head,
    last_released_head_sha: head,
    status_surface: {
      verdict: "pending",
      ok: false,
      decisive_successes: [],
      blocking_failures: [],
      pending_surfaces: ["PR Head Status Readback / Read PR head status"],
      non_blocking_warnings: [],
    },
    candidates: [{ candidate_id: "handoff", input: candidate() }],
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_release");
  assert.equal(verdict.status_claim_allowed, false);
  assert.deepEqual(verdict.blockers, ["PR Head Status Readback / Read PR head status"]);
});

test("emits exact blocker when no embodiment candidate survives", () => {
  const verdict = compileContinuationHandoff({
    branch,
    active_branch: branch,
    current_head_sha: head,
    last_released_head_sha: head,
    candidates: [
      {
        candidate_id: "blocker",
        input: candidate({
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
  assert.equal(verdict.action, "emit_exact_blocker");
  assert.deepEqual(verdict.blockers, ["no writable external branch surface is available"]);
});

test("rejects handoff on the wrong branch", () => {
  const verdict = compileContinuationHandoff({
    branch: "main",
    active_branch: branch,
    current_head_sha: head,
    last_released_head_sha: head,
    candidates: [{ candidate_id: "handoff", input: candidate() }],
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_release");
  assert.deepEqual(verdict.blockers, [`handoff branch main does not match active branch ${branch}`]);
});
