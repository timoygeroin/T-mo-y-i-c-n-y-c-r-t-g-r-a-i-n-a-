import assert from "node:assert/strict";
import { test } from "node:test";

import { routePostWriteObligation, type PostWriteObligationInput } from "./post-write-obligation-router.js";

const branch = "monday-platform-genesis-01";
const before = "6efa281c6a0fe18f307dae2c3b5829cd04b55eaf";
const after = "9d7fb05608e5c4d59af10d30af6f22fc735088b8";

function input(overrides: Partial<PostWriteObligationInput> = {}): PostWriteObligationInput {
  return {
    active_branch: branch,
    write_branch: branch,
    pre_write_head_sha: before,
    post_write_head_sha: after,
    write_committed: true,
    requested_move: "continue_external_embodiment",
    status_surface: {
      head_sha: after,
      verdict: "passing_with_warnings",
      decisive_successes: ["Route Governor Proof / proof examples succeeded"],
      blocking_failures: [],
      pending_surfaces: [],
      non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
    },
    repeated_move_classes: ["publish_comment", "apply_label", "local_memory_guard", "replay_resolved_blocker"],
    candidate_changed_files: ["platform/packages/route-governor/src/post-write-obligation-router.ts"],
    candidate_executable_artifacts: ["routePostWriteObligation"],
    candidate_routing_artifacts: ["post-write runs must settle moved-head status before further embodiment"],
    ...overrides,
  };
}

test("requires moved-head status immediately after an external write", () => {
  const verdict = routePostWriteObligation(input({ status_surface: undefined }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "require_moved_head_status");
  assert.deepEqual(verdict.blockers, [`missing status surface for moved head ${after}`]);
});

test("blocks non-progress post-write moves before they can count as continuation", () => {
  const verdict = routePostWriteObligation(input({ requested_move: "publish_comment" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_progress_move");
  assert.ok(verdict.blockers[0].includes("publish_comment"));
});

test("blocks stale status surfaces from older heads", () => {
  const verdict = routePostWriteObligation(
    input({
      status_surface: {
        head_sha: before,
        verdict: "passing",
        decisive_successes: ["old success"],
        blocking_failures: [],
        pending_surfaces: [],
        non_blocking_warnings: [],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_or_unbound_status");
  assert.deepEqual(verdict.blockers, [`status surface belongs to ${before}, not moved head ${after}`]);
});

test("routes failing moved-head status to concrete repair", () => {
  const verdict = routePostWriteObligation(
    input({
      status_surface: {
        head_sha: after,
        verdict: "failing",
        decisive_successes: [],
        blocking_failures: ["Route Governor Proof / proof examples failed"],
        pending_surfaces: [],
        non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "require_current_head_repair");
  assert.deepEqual(verdict.blockers, ["Route Governor Proof / proof examples failed"]);
  assert.deepEqual(verdict.warnings, ["Node.js 20 Actions deprecation notice"]);
});

test("waits when moved-head checks are pending", () => {
  const verdict = routePostWriteObligation(
    input({
      status_surface: {
        head_sha: after,
        verdict: "pending",
        decisive_successes: [],
        blocking_failures: [],
        pending_surfaces: ["Monday Platform CI / Route governor proof surface"],
        non_blocking_warnings: [],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "wait_for_current_head_checks");
  assert.deepEqual(verdict.blockers, ["Monday Platform CI / Route governor proof surface"]);
});

test("admits the next embodiment only after passing moved-head status and executable evidence", () => {
  const verdict = routePostWriteObligation(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_next_embodiment");
  assert.deepEqual(verdict.blockers, []);
  assert.ok(verdict.decisive_evidence.includes("routePostWriteObligation"));
  assert.ok(verdict.next_route.includes("restart the post-write obligation"));
});

test("blocks passing status from becoming another status reread as progress", () => {
  const verdict = routePostWriteObligation(input({ requested_move: "read_moved_head_status" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_progress_move");
  assert.ok(verdict.blockers[0].includes("already bound and classified"));
});
