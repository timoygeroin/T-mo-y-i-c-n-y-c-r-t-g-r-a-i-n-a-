import assert from "node:assert/strict";

import { routeLiveHeadAdvance, type LiveHeadAdvanceInput } from "./live-head-advance-policy.js";

const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "4f5d6be00b13f7bf1a1a542088d8b4ebed0692d6";

function base(overrides: Partial<LiveHeadAdvanceInput> = {}): LiveHeadAdvanceInput {
  return {
    branch: "monday-platform-genesis-01",
    active_branch: "monday-platform-genesis-01",
    prompt_head_sha: repairedHead,
    live_head_sha: liveHead,
    repaired_head_sha: repairedHead,
    repaired_head_status_resolved: true,
    attempted_move_class: "external_platform_embodiment",
    prohibited_move_classes: [
      "metadata_reread",
      "duplicate_ci_summary",
      "duplicate_comment",
      "duplicate_label",
      "local_memory_guard",
      "guessed_future_ci",
      "reclose_completed_blocker",
      "old_repaired_head_blocker",
    ],
    failure_surfaces: [],
    ...overrides,
  };
}

const movedHeadNeedsStatus = routeLiveHeadAdvance(base({ status_surface: undefined }));
assert.equal(movedHeadNeedsStatus.ok, true);
assert.equal(movedHeadNeedsStatus.action, "read_live_head_status");
assert.ok(movedHeadNeedsStatus.decisive_evidence[0].includes(liveHead));

const staleStatus = routeLiveHeadAdvance(
  base({
    status_surface: {
      head_sha: repairedHead,
      verdict: "passing",
      decisive_successes: ["old repaired-head success"],
      blocking_failures: [],
      pending_surfaces: [],
      non_blocking_warnings: [],
    },
  }),
);
assert.equal(staleStatus.ok, false);
assert.equal(staleStatus.action, "block_stale_status_surface");
assert.ok(staleStatus.blockers[0].includes("not live head"));

const actionableFailure = routeLiveHeadAdvance(
  base({
    status_surface: {
      head_sha: liveHead,
      verdict: "failing",
      decisive_successes: [],
      blocking_failures: ["Monday Platform CI / Route governor proof surface: failure"],
      pending_surfaces: [],
      non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
    },
    failure_surfaces: [
      {
        surface_id: "run-27080000001",
        head_sha: liveHead,
        check_name: "Monday Platform CI / Route governor proof surface",
        failed_step: "Run proof examples",
        assertion: "expected post-readback continuation to select live-head repair",
      },
    ],
  }),
);
assert.equal(actionableFailure.ok, true);
assert.equal(actionableFailure.action, "repair_live_head_failure");
assert.deepEqual(actionableFailure.blockers, []);
assert.ok(actionableFailure.decisive_evidence.some((evidence) => evidence.includes("live-head repair")));
assert.deepEqual(actionableFailure.warnings, ["Node.js 20 Actions deprecation notice"]);

const pendingStatus = routeLiveHeadAdvance(
  base({
    status_surface: {
      head_sha: liveHead,
      verdict: "pending",
      decisive_successes: [],
      blocking_failures: [],
      pending_surfaces: ["PR Head Status Readback / Read PR head status"],
      non_blocking_warnings: [],
    },
  }),
);
assert.equal(pendingStatus.ok, false);
assert.equal(pendingStatus.action, "wait_for_live_head_checks");
assert.deepEqual(pendingStatus.blockers, ["PR Head Status Readback / Read PR head status"]);

const passingStatus = routeLiveHeadAdvance(
  base({
    status_surface: {
      head_sha: liveHead,
      verdict: "passing_with_warnings",
      decisive_successes: ["Route Governor Proof / Route governor proof examples: success"],
      blocking_failures: [],
      pending_surfaces: [],
      non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
    },
  }),
);
assert.equal(passingStatus.ok, true);
assert.equal(passingStatus.action, "continue_external_embodiment");
assert.deepEqual(passingStatus.blockers, []);
assert.equal(passingStatus.next_route, "commit a non-repeated executable platform embodiment, then read checks bound to the new head");

const prohibitedRepeat = routeLiveHeadAdvance(base({ attempted_move_class: "duplicate_comment" }));
assert.equal(prohibitedRepeat.ok, false);
assert.equal(prohibitedRepeat.action, "block_repeated_finalization_class");
assert.ok(prohibitedRepeat.blockers[0].includes("duplicate_comment"));

console.log("live-head-advance-policy proof passed");
