import assert from "node:assert/strict";

import { compileLiveHeadReadbackGate } from "./finalization-live-head-readback-gate.js";

const branch = "monday-platform-genesis-01";
const promptHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const previousReadbackHead = "21acec07f485b12f6933a1f894a035880e400a02";
const liveHead = "88e4c9c5954f1ddac3af282e8c9678a0008b3fd2";

const admitted = compileLiveHeadReadbackGate({
  branch,
  active_branch: branch,
  prompt_head_sha: promptHead,
  live_head_sha: liveHead,
  previous_readback_head_sha: previousReadbackHead,
  resolved_repaired_head_sha: promptHead,
  move_class: "fresh_status_readback",
  readback_id: `readback-pr-2:${liveHead}`,
  spent_readback_ids: [],
  status_surface: {
    surface_id: `checks-pr-2:${liveHead}`,
    head_sha: liveHead,
    check_run_ids: ["route-governor-proof"],
    workflow_run_ids: ["monday-platform-ci"],
    observed_at: "2026-06-20T19:10:18Z",
  },
});

assert.equal(admitted.ok, true);
assert.equal(admitted.action, "admit_live_head_status_readback");
assert.equal(admitted.command?.expected_head_sha, liveHead);
assert.equal(admitted.command?.forbidden_sources.includes(promptHead), true);
assert.match(admitted.next_route, /expected_head_sha/);

const staleSurface = compileLiveHeadReadbackGate({
  branch,
  active_branch: branch,
  prompt_head_sha: promptHead,
  live_head_sha: liveHead,
  previous_readback_head_sha: previousReadbackHead,
  resolved_repaired_head_sha: promptHead,
  move_class: "fresh_status_readback",
  readback_id: `readback-pr-2:${liveHead}:stale`,
  spent_readback_ids: [],
  status_surface: {
    surface_id: "checks-old-head",
    head_sha: previousReadbackHead,
    check_run_ids: ["old-route-governor-proof"],
    workflow_run_ids: [],
    observed_at: "2026-06-20T14:04:00Z",
  },
});

assert.equal(staleSurface.ok, false);
assert.equal(staleSurface.action, "block_stale_status_surface");
assert.match(staleSurface.blockers.join("\n"), /not 88e4c9c/);

const duplicateSummary = compileLiveHeadReadbackGate({
  branch,
  active_branch: branch,
  prompt_head_sha: promptHead,
  live_head_sha: liveHead,
  previous_readback_head_sha: previousReadbackHead,
  resolved_repaired_head_sha: promptHead,
  move_class: "duplicate_ci_summary",
  readback_id: "duplicate",
  spent_readback_ids: [],
});

assert.equal(duplicateSummary.ok, false);
assert.equal(duplicateSummary.action, "block_non_progress_move");

const embodiment = compileLiveHeadReadbackGate({
  branch,
  active_branch: branch,
  prompt_head_sha: promptHead,
  live_head_sha: liveHead,
  previous_readback_head_sha: previousReadbackHead,
  resolved_repaired_head_sha: promptHead,
  move_class: "external_platform_embodiment",
  readback_id: "",
  spent_readback_ids: [],
});

assert.equal(embodiment.ok, true);
assert.equal(embodiment.action, "route_to_external_embodiment");

const blocker = compileLiveHeadReadbackGate({
  branch,
  active_branch: branch,
  prompt_head_sha: promptHead,
  live_head_sha: liveHead,
  previous_readback_head_sha: previousReadbackHead,
  resolved_repaired_head_sha: promptHead,
  move_class: "exact_external_blocker",
  readback_id: "",
  spent_readback_ids: [],
  exact_blocker: "live-head Checks surface is unreachable from the current connector",
});

assert.equal(blocker.ok, true);
assert.equal(blocker.action, "emit_exact_external_blocker");
