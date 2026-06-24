import assert from "node:assert/strict";
import { test } from "node:test";

import {
  routeSupersededFailureBlocker,
  type FailureBlockerRecord,
  type SupersededFailureBlockerInput,
} from "./superseded-failure-blocker.js";

const branch = "monday-platform-genesis-01";
const blockedHead = "64e5e9606ee3457119096b37faadcc3982eec220";
const liveHead = "61e66eea39fde5d2f80be07d7ab44a6c72a674ee";

function blocker(overrides: Partial<FailureBlockerRecord> = {}): FailureBlockerRecord {
  return {
    blocker_id: "current-head-failure-log-surface-insufficient",
    blocker_kind: "failure_log_surface_insufficient",
    branch,
    head_sha: blockedHead,
    blocker_text:
      "CURRENT_HEAD_FAILURE_LOG_SURFACE_INSUFFICIENT: public checks expose a failing step but not the assertion needed for repair",
    required_surface: "signed-in Actions log or workflow-published readback artifact",
    ...overrides,
  };
}

function input(overrides: Partial<SupersededFailureBlockerInput> = {}): SupersededFailureBlockerInput {
  return {
    active_branch: branch,
    live_head_sha: liveHead,
    previous_readback_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
    blocker: blocker(),
    next_candidate_class: "fresh_status_readback",
    ...overrides,
  };
}

test("retires a failure blocker after the live PR head moves past it", () => {
  const verdict = routeSupersededFailureBlocker(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "retire_superseded_blocker");
  assert.deepEqual(verdict.blockers, []);
  assert.deepEqual(verdict.retired_blocker_ids, ["current-head-failure-log-surface-insufficient"]);
  assert.match(verdict.next_route, /do not replay the superseded failure blocker/);
});

test("holds a failure blocker while it is still bound to the live head", () => {
  const verdict = routeSupersededFailureBlocker(
    input({
      live_head_sha: blockedHead,
      blocker: blocker({ head_sha: blockedHead }),
      next_candidate_class: "external_platform_embodiment",
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "hold_current_blocker");
  assert.deepEqual(verdict.blockers, [blocker().blocker_text]);
  assert.deepEqual(verdict.retired_blocker_ids, []);
  assert.match(verdict.next_route, /required evidence/);
});

test("blocks a failure blocker recorded for a different branch", () => {
  const verdict = routeSupersededFailureBlocker(input({ blocker: blocker({ branch: "main" }) }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_branch_mismatch");
  assert.deepEqual(verdict.retired_blocker_ids, []);
});

test("blocks empty blocker records instead of laundering them into exact blockers", () => {
  const verdict = routeSupersededFailureBlocker(input({ blocker: blocker({ blocker_text: "" }) }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_empty_blocker");
  assert.deepEqual(verdict.retired_blocker_ids, []);
});
