import assert from "node:assert/strict";

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

const embodiment = compileResolvedBoundaryContinuation(input());
assert.equal(embodiment.ok, true);
assert.equal(embodiment.action, "admit_next_embodiment");

const replayedBlocker = compileResolvedBoundaryContinuation(input({ requested_move_class: "old_repaired_head_blocker" }));
assert.equal(replayedBlocker.ok, false);
assert.equal(replayedBlocker.action, "block_replayed_resolution");

const duplicateSummary = compileResolvedBoundaryContinuation(input({ requested_move_class: "duplicate_ci_summary" }));
assert.equal(duplicateSummary.ok, false);
assert.equal(duplicateSummary.action, "block_replayed_resolution");

const noFreshStatus = compileResolvedBoundaryContinuation(
  input({ requested_move_class: "fresh_status_readback", embodiment: undefined }),
);
assert.equal(noFreshStatus.ok, false);
assert.equal(noFreshStatus.action, "block_replayed_resolution");

const movedHead = compileResolvedBoundaryContinuation(
  input({
    live_head_sha: "1dc7afbcc42b8688f7f32abc9b8420d4d15c6451",
    requested_move_class: "fresh_status_readback",
    embodiment: undefined,
  }),
);
assert.equal(movedHead.ok, true);
assert.equal(movedHead.action, "admit_fresh_readback");

console.log("resolved boundary continuation proof passed");
