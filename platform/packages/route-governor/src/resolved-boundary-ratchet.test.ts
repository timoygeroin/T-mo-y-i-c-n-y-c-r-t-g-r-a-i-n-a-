import assert from "node:assert/strict";
import { test } from "node:test";

import {
  routeResolvedBoundaryRatchet,
  type ResolvedBoundaryNextMove,
  type ResolvedBoundaryState,
} from "./resolved-boundary-ratchet.js";

const BRANCH = "monday-platform-genesis-01";
const REPAIRED_HEAD = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const LIVE_HEAD = "f4e4213938ebd7baef0230920ecbc6e5b6f098ea";

function resolvedState(overrides: Partial<ResolvedBoundaryState> = {}): ResolvedBoundaryState {
  return {
    active_branch: BRANCH,
    live_head_sha: LIVE_HEAD,
    repaired_head_sha: REPAIRED_HEAD,
    resolved_repaired_head_sha: REPAIRED_HEAD,
    issue_closed: true,
    blocker_label_removed: true,
    pr_ready_for_review: true,
    repaired_head_checks: [
      { id: "27049650678", head_sha: REPAIRED_HEAD, conclusion: "success" },
      { id: "27049650677", head_sha: REPAIRED_HEAD, conclusion: "success" },
      { id: "27049650682", head_sha: REPAIRED_HEAD, conclusion: "success" },
      { id: "27049651469", head_sha: REPAIRED_HEAD, conclusion: "success" },
      { id: "27049651460", head_sha: REPAIRED_HEAD, conclusion: "success" },
      { id: "27049651459", head_sha: REPAIRED_HEAD, conclusion: "success" },
      { id: "27049651467", head_sha: REPAIRED_HEAD, conclusion: "success" },
    ],
    ...overrides,
  };
}

function embodiment(overrides: Partial<ResolvedBoundaryNextMove> = {}): ResolvedBoundaryNextMove {
  return {
    move_id: "resolved-boundary-ratchet",
    move_class: "external_platform_embodiment",
    branch: BRANCH,
    base_head_sha: LIVE_HEAD,
    changed_files: ["platform/packages/route-governor/src/resolved-boundary-ratchet.ts"],
    executable_artifacts: ["routeResolvedBoundaryRatchet"],
    routing_artifacts: ["resolved repaired-head boundary forces next-route advancement"],
    ...overrides,
  };
}

test("advances to a behavior-bearing embodiment after repaired-head boundary resolution", () => {
  const verdict = routeResolvedBoundaryRatchet(resolvedState(), embodiment());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "advance_to_external_embodiment");
  assert.equal(verdict.branch, BRANCH);
  assert.equal(verdict.live_head_sha, LIVE_HEAD);
  assert.match(verdict.next_route, /moved live head only/);
  assert.ok(verdict.decisive_evidence.includes("successful repaired-head check 27049651467"));
  assert.ok(verdict.decisive_evidence.includes("platform/packages/route-governor/src/resolved-boundary-ratchet.ts"));
});

test("blocks the old repaired-head blocker after the boundary is resolved", () => {
  const verdict = routeResolvedBoundaryRatchet(
    resolvedState(),
    embodiment({
      move_id: "old-status-readback-blocker",
      move_class: "repaired_head_blocker_replay",
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_repaired_head_replay");
  assert.deepEqual(verdict.blockers, [`repaired-head blocker is already resolved for ${REPAIRED_HEAD}`]);
});

test("blocks duplicate summaries and metadata rereads as non-progress", () => {
  const verdict = routeResolvedBoundaryRatchet(
    resolvedState(),
    embodiment({
      move_id: "duplicate-ci-summary",
      move_class: "duplicate_ci_summary",
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_progress_move");
  assert.deepEqual(verdict.blockers, ["move class is non-progress after boundary resolution: duplicate_ci_summary"]);
});

test("refuses to retire the blocker family before all resolved-boundary facts are true", () => {
  const verdict = routeResolvedBoundaryRatchet(
    resolvedState({
      issue_closed: false,
      blocker_label_removed: false,
      pr_ready_for_review: false,
      repaired_head_checks: [],
    }),
    embodiment(),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_unresolved_boundary");
  assert.deepEqual(verdict.blockers, [
    "resolved boundary has no successful repaired-head check receipts",
    "resolved boundary issue is not closed",
    "resolved boundary blocker label is still present",
    "PR is not ready for review after repaired-head resolution",
  ]);
});

test("admits fresh readback only for the current live head", () => {
  const verdict = routeResolvedBoundaryRatchet(
    resolvedState(),
    embodiment({
      move_id: "live-head-readback",
      move_class: "fresh_status_readback",
      status_head_sha: LIVE_HEAD,
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "advance_to_fresh_live_head_readback");

  const stale = routeResolvedBoundaryRatchet(
    resolvedState(),
    embodiment({
      move_id: "stale-readback",
      move_class: "fresh_status_readback",
      status_head_sha: REPAIRED_HEAD,
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
    }),
  );

  assert.equal(stale.ok, false);
  assert.equal(stale.action, "block_stale_head_authority");
  assert.deepEqual(stale.blockers, [`status head ${REPAIRED_HEAD} is not live head ${LIVE_HEAD}`]);
});

test("requires exact blocker text for blocker moves", () => {
  const verdict = routeResolvedBoundaryRatchet(
    resolvedState(),
    embodiment({
      move_id: "empty-blocker",
      move_class: "exact_external_blocker",
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_exact_blocker");
  assert.deepEqual(verdict.blockers, ["exact external blocker move has no blocker text"]);
});
