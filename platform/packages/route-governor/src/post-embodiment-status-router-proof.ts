import assert from "node:assert/strict";

import { routePostEmbodimentStatus, type PostEmbodimentStatusRouterInput } from "./post-embodiment-status-router.js";
import type { StatusSurfaceClassification } from "./status-surface.js";

const head = "new-pr-head-sha";

function status(overrides: Partial<StatusSurfaceClassification> = {}): StatusSurfaceClassification {
  return {
    ok: true,
    verdict: "passing",
    decisive_successes: ["Monday Platform CI / Route governor proof surface: success"],
    blocking_failures: [],
    pending_surfaces: [],
    non_blocking_warnings: [],
    ...overrides,
  };
}

function base(overrides: Partial<PostEmbodimentStatusRouterInput> = {}): PostEmbodimentStatusRouterInput {
  return {
    branch: "monday-platform-genesis-01",
    active_branch: "monday-platform-genesis-01",
    new_head_sha: head,
    cursor_action: "require_new_head_status_readback",
    ...overrides,
  };
}

const missingReadback = routePostEmbodimentStatus(base());
assert.equal(missingReadback.ok, false);
assert.equal(missingReadback.action, "read_new_head_status");
assert.deepEqual(missingReadback.blockers, [`missing status readback for new head ${head}`]);

const staleReadback = routePostEmbodimentStatus(base({ status_readback_head_sha: "old-pr-head-sha" }));
assert.equal(staleReadback.ok, false);
assert.equal(staleReadback.action, "block_status_head_mismatch");
assert.deepEqual(staleReadback.blockers, [`status readback belongs to old-pr-head-sha, not new head ${head}`]);

const missingClassification = routePostEmbodimentStatus(base({ status_readback_head_sha: head }));
assert.equal(missingClassification.ok, false);
assert.equal(missingClassification.action, "read_new_head_status");
assert.deepEqual(missingClassification.blockers, [`missing status surface classification for new head ${head}`]);

const pending = routePostEmbodimentStatus(
  base({
    status_readback_head_sha: head,
    status_surface: status({
      ok: false,
      verdict: "pending",
      decisive_successes: [],
      pending_surfaces: ["PR Head Status Readback / Read PR head status: in_progress"],
    }),
  }),
);
assert.equal(pending.ok, false);
assert.equal(pending.action, "wait_for_new_head_checks");
assert.deepEqual(pending.blockers, ["PR Head Status Readback / Read PR head status: in_progress"]);

const failing = routePostEmbodimentStatus(
  base({
    status_readback_head_sha: head,
    status_surface: status({
      ok: false,
      verdict: "failing",
      decisive_successes: [],
      blocking_failures: ["Monday Platform CI / Run proof examples: failure"],
      non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
    }),
  }),
);
assert.equal(failing.ok, false);
assert.equal(failing.action, "repair_new_head_failure");
assert.deepEqual(failing.blockers, ["Monday Platform CI / Run proof examples: failure"]);
assert.deepEqual(failing.warnings, ["Node.js 20 Actions deprecation notice"]);

const passing = routePostEmbodimentStatus(
  base({
    status_readback_head_sha: head,
    status_surface: status({
      verdict: "passing_with_warnings",
      non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
    }),
  }),
);
assert.equal(passing.ok, true);
assert.equal(passing.action, "continue_after_passing_status");
assert.deepEqual(passing.blockers, []);
assert.deepEqual(passing.warnings, ["Node.js 20 Actions deprecation notice"]);
assert.match(passing.next_route, /non-repeated executable embodiment/);

const noSurface = routePostEmbodimentStatus(
  base({
    status_readback_head_sha: head,
    status_surface: status({ ok: false, verdict: "no_status_surface", decisive_successes: [] }),
  }),
);
assert.equal(noSurface.ok, false);
assert.equal(noSurface.action, "read_new_head_status");

const wrongBranch = routePostEmbodimentStatus(base({ branch: "main" }));
assert.equal(wrongBranch.ok, false);
assert.equal(wrongBranch.action, "block_cursor_not_ready");

const cursorNotReady = routePostEmbodimentStatus(base({ cursor_action: "block_no_head_move" }));
assert.equal(cursorNotReady.ok, false);
assert.equal(cursorNotReady.action, "block_cursor_not_ready");
assert.deepEqual(cursorNotReady.blockers, ["post-embodiment cursor action is not status-ready: block_no_head_move"]);

console.log("post-embodiment status router proof passed");
