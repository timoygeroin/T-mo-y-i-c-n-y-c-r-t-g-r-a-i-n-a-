import assert from "node:assert/strict";

import { compileLiveHeadReadbackCursor, type LiveHeadReadbackCursorInput } from "./live-head-readback-cursor.js";

const branch = "monday-platform-genesis-01";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "ef6f7a82623e707249d55cbfbcc550aca61c5d0d";

function input(overrides: Partial<LiveHeadReadbackCursorInput> = {}): LiveHeadReadbackCursorInput {
  return {
    branch,
    active_branch: branch,
    repaired_head_sha: repairedHead,
    previous_known_head_sha: repairedHead,
    live_head_sha: liveHead,
    previous_readback_head_sha: repairedHead,
    attempted_release_class: "fresh_live_head_readback",
    prohibited_release_classes: [
      "old_repaired_head_blocker",
      "duplicate_ci_summary",
      "metadata_reread",
      "duplicate_comment",
      "local_memory_guard",
    ],
    ...overrides,
  };
}

const movedHead = compileLiveHeadReadbackCursor(input());
assert.equal(movedHead.ok, true);
assert.equal(movedHead.action, "open_fresh_readback");
assert.equal(movedHead.required_readback_head_sha, liveHead);
assert.deepEqual(movedHead.decisive_evidence, [`head moved from ${repairedHead} to ${liveHead}`]);

const oldBlocker = compileLiveHeadReadbackCursor(
  input({
    live_head_sha: repairedHead,
    previous_known_head_sha: repairedHead,
    previous_readback_head_sha: repairedHead,
    attempted_release_class: "old_repaired_head_blocker",
  }),
);
assert.equal(oldBlocker.ok, false);
assert.equal(oldBlocker.action, "block_replayed_repaired_head");
assert.match(oldBlocker.next_route, /live head/);

const staleSurface = compileLiveHeadReadbackCursor(
  input({
    status_surface: {
      head_sha: repairedHead,
      verdict: "passing_with_warnings",
      decisive_successes: ["old repaired-head checks passed"],
      blocking_failures: [],
      pending_surfaces: [],
      non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
    },
  }),
);
assert.equal(staleSurface.ok, false);
assert.equal(staleSurface.action, "block_stale_readback");
assert.deepEqual(staleSurface.warnings, ["Node.js 20 Actions deprecation notice"]);

const pendingSurface = compileLiveHeadReadbackCursor(
  input({
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
assert.equal(pendingSurface.ok, false);
assert.equal(pendingSurface.action, "block_pending_readback");
assert.deepEqual(pendingSurface.blockers, ["PR Head Status Readback / Read PR head status"]);

const currentPassing = compileLiveHeadReadbackCursor(
  input({
    status_surface: {
      head_sha: liveHead,
      verdict: "passing_with_warnings",
      decisive_successes: ["Monday Platform CI / Route governor proof surface: success"],
      blocking_failures: [],
      pending_surfaces: [],
      non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
    },
  }),
);
assert.equal(currentPassing.ok, true);
assert.equal(currentPassing.action, "accept_current_readback");
assert.deepEqual(currentPassing.decisive_evidence, ["Monday Platform CI / Route governor proof surface: success"]);
assert.deepEqual(currentPassing.warnings, ["Node.js 20 Actions deprecation notice"]);
assert.match(currentPassing.next_route, /non-repeated executable embodiment/);

const noMoveReplay = compileLiveHeadReadbackCursor(
  input({
    previous_known_head_sha: liveHead,
    previous_readback_head_sha: liveHead,
  }),
);
assert.equal(noMoveReplay.ok, false);
assert.equal(noMoveReplay.action, "block_replayed_repaired_head");

console.log("live-head readback cursor proof passed");
