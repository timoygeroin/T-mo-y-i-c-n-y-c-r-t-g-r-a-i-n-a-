import assert from "node:assert/strict";
import { test } from "node:test";

import {
  compileResolvedBoundaryContinuation,
  type ResolvedBoundaryContinuationInput,
} from "./resolved-boundary-continuation.js";

const branch = "monday-platform-genesis-01";
const resolvedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const expectedRuns = [
  "27049650678",
  "27049650677",
  "27049650682",
  "27049651469",
  "27049651460",
  "27049651459",
  "27049651467",
];

function input(overrides: Partial<ResolvedBoundaryContinuationInput> = {}): ResolvedBoundaryContinuationInput {
  return {
    branch,
    active_branch: branch,
    live_head_sha: resolvedHead,
    resolved_repaired_head_sha: resolvedHead,
    completed_issue_state: "closed",
    blocked_label_present: false,
    pr_draft: false,
    repaired_head_status: {
      head_sha: resolvedHead,
      succeeded_run_ids: expectedRuns,
      expected_succeeded_run_ids: expectedRuns,
      non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
      blocking_failures: [],
      pending_surfaces: [],
    },
    requested_move_class: "external_platform_embodiment",
    embodiment: {
      artifact_class: "resolved-boundary-continuation-compiler",
      changed_files: ["platform/packages/route-governor/src/resolved-boundary-continuation.ts"],
      executable_artifacts: ["compileResolvedBoundaryContinuation"],
      routing_artifacts: ["resolved boundary forces next embodiment or genuinely fresh readback"],
      proof_artifacts: ["dist/resolved-boundary-continuation-proof.js"],
      spent_artifact_classes: ["post-status-embodiment-queue", "warning-maintenance-router"],
    },
    ...overrides,
  };
}

test("admits behavior-bearing next embodiment after repaired-head boundary is resolved", () => {
  const verdict = compileResolvedBoundaryContinuation(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_next_embodiment");
  assert.deepEqual(verdict.blockers, []);
  assert.ok(verdict.decisive_evidence.includes("resolved repaired head b38ea247602ae8ebba80c4120ad03b41b26bd841"));
  assert.ok(verdict.decisive_evidence.includes("compileResolvedBoundaryContinuation"));
});

test("blocks replaying the old repaired-head blocker as progress", () => {
  const verdict = compileResolvedBoundaryContinuation(input({ requested_move_class: "old_repaired_head_blocker" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_replayed_resolution");
  assert.deepEqual(verdict.blockers, ["resolved boundary cannot be counted through old_repaired_head_blocker"]);
});

test("blocks duplicate status summaries after the repaired-head checks are already resolved", () => {
  const verdict = compileResolvedBoundaryContinuation(input({ requested_move_class: "duplicate_ci_summary" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_replayed_resolution");
});

test("blocks fresh readback unless the PR head moved or new current-head checks appeared", () => {
  const verdict = compileResolvedBoundaryContinuation(
    input({
      requested_move_class: "fresh_status_readback",
      embodiment: undefined,
      new_check_runs: [],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_replayed_resolution");
  assert.deepEqual(verdict.blockers, [
    "fresh readback requires a moved PR head or new current-head check runs after the resolved boundary",
  ]);
});

test("admits fresh readback when a new current-head check appears", () => {
  const verdict = compileResolvedBoundaryContinuation(
    input({
      requested_move_class: "fresh_status_readback",
      embodiment: undefined,
      new_check_runs: [{ id: "27049699999", head_sha: resolvedHead }],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_fresh_readback");
  assert.ok(verdict.decisive_evidence.includes("fresh current-head check run 27049699999"));
});

test("admits fresh readback when the live head moved beyond the resolved repaired head", () => {
  const movedHead = "1dc7afbcc42b8688f7f32abc9b8420d4d15c6451";
  const verdict = compileResolvedBoundaryContinuation(
    input({
      live_head_sha: movedHead,
      requested_move_class: "fresh_status_readback",
      embodiment: undefined,
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_fresh_readback");
  assert.ok(verdict.decisive_evidence.includes(`live head moved from ${resolvedHead} to ${movedHead}`));
});

test("blocks unresolved repaired-head boundary details", () => {
  const verdict = compileResolvedBoundaryContinuation(
    input({
      completed_issue_state: "open",
      blocked_label_present: true,
      repaired_head_status: {
        head_sha: resolvedHead,
        succeeded_run_ids: expectedRuns.slice(0, 6),
        expected_succeeded_run_ids: expectedRuns,
        non_blocking_warnings: [],
        blocking_failures: [],
        pending_surfaces: [],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_unresolved_boundary");
  assert.ok(verdict.blockers.includes("completed blocker issue is not closed"));
  assert.ok(verdict.blockers.includes("blocked: ci-status-readback label is still present"));
  assert.ok(verdict.blockers.includes("resolved repaired-head status is missing succeeded run 27049651467"));
});

test("blocks proof-only embodiment candidates", () => {
  const verdict = compileResolvedBoundaryContinuation(
    input({
      embodiment: {
        artifact_class: "resolved-boundary-continuation-compiler",
        changed_files: ["platform/packages/route-governor/src/resolved-boundary-continuation-proof.ts"],
        executable_artifacts: ["compileResolvedBoundaryContinuation"],
        routing_artifacts: ["resolved boundary routing"],
        proof_artifacts: ["dist/resolved-boundary-continuation-proof.js"],
        spent_artifact_classes: [],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_embodiment");
  assert.ok(verdict.blockers.includes("embodiment candidate is proof-only and has no behavior-bearing file"));
});
