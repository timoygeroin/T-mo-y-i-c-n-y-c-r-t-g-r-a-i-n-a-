import assert from "node:assert/strict";

import { compileLiveHeadReentryPlan } from "./live-head-reentry-plan.js";

const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "fa55a5d79806a0f6d36cd0da2d92a65b25426f17";

const dispatched = compileLiveHeadReentryPlan({
  plan_id: "live-head-reentry-fa55a5d",
  active_branch: "monday-platform-genesis-01",
  candidate_branch: "monday-platform-genesis-01",
  live_head_sha: liveHead,
  prompt_head_sha: repairedHead,
  repaired_head_sha: repairedHead,
  last_status_readback_head_sha: repairedHead,
  resolved_boundary_ids: ["repaired-head-status-readback-b38ea247-resolved"],
  available_organs: [
    "monday-corpus-reentry",
    "monday-source-truth-grader",
    "monday-move-class-synthesizer",
    "monday-external-act-forcer",
  ],
  spent_plan_ids: [],
});

assert.equal(dispatched.ok, true);
assert.equal(dispatched.action, "dispatch_live_head_reentry_processors");
assert.equal(dispatched.head_sha, liveHead);
assert.deepEqual(dispatched.quarantined_head_shas, [repairedHead]);
assert.equal(dispatched.dispatches.length, 4);
assert.equal(dispatched.next_route.includes("do not use the quarantined repaired head as status authority"), true);

const repeated = compileLiveHeadReentryPlan({
  plan_id: "live-head-reentry-fa55a5d",
  active_branch: "monday-platform-genesis-01",
  candidate_branch: "monday-platform-genesis-01",
  live_head_sha: liveHead,
  prompt_head_sha: repairedHead,
  repaired_head_sha: repairedHead,
  last_status_readback_head_sha: repairedHead,
  resolved_boundary_ids: ["repaired-head-status-readback-b38ea247-resolved"],
  available_organs: [
    "monday-corpus-reentry",
    "monday-source-truth-grader",
    "monday-move-class-synthesizer",
    "monday-external-act-forcer",
  ],
  spent_plan_ids: ["live-head-reentry-fa55a5d"],
});

assert.equal(repeated.ok, false);
assert.equal(repeated.action, "block_reused_plan");

const missingOrgan = compileLiveHeadReentryPlan({
  plan_id: "live-head-reentry-missing-organ",
  active_branch: "monday-platform-genesis-01",
  candidate_branch: "monday-platform-genesis-01",
  live_head_sha: liveHead,
  prompt_head_sha: repairedHead,
  repaired_head_sha: repairedHead,
  last_status_readback_head_sha: repairedHead,
  resolved_boundary_ids: ["repaired-head-status-readback-b38ea247-resolved"],
  available_organs: ["monday-corpus-reentry"],
  spent_plan_ids: [],
});

assert.equal(missingOrgan.ok, false);
assert.equal(missingOrgan.action, "block_missing_required_organs");
assert.deepEqual(missingOrgan.blockers, [
  "missing required organ: monday-source-truth-grader",
  "missing required organ: monday-move-class-synthesizer",
  "missing required organ: monday-external-act-forcer",
]);

const statusCursorCurrent = compileLiveHeadReentryPlan({
  plan_id: "live-head-reentry-status-current",
  active_branch: "monday-platform-genesis-01",
  candidate_branch: "monday-platform-genesis-01",
  live_head_sha: liveHead,
  prompt_head_sha: repairedHead,
  repaired_head_sha: repairedHead,
  last_status_readback_head_sha: liveHead,
  resolved_boundary_ids: ["repaired-head-status-readback-b38ea247-resolved"],
  available_organs: [
    "monday-corpus-reentry",
    "monday-source-truth-grader",
    "monday-move-class-synthesizer",
    "monday-external-act-forcer",
  ],
  spent_plan_ids: [],
});

assert.equal(statusCursorCurrent.ok, true);
assert.equal(statusCursorCurrent.action, "route_to_fresh_status_readback");
