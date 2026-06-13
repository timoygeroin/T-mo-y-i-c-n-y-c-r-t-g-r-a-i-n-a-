import assert from "node:assert/strict";
import { test } from "node:test";

import {
  compileStatusReadbackAuthorityLease,
  type StatusReadbackAuthorityLeaseInput,
  type StatusReadbackLeaseSurface,
} from "./status-readback-authority-lease.js";

const branch = "monday-platform-genesis-01";
const oldHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "be8e3d080cd897038154ec405c6e55e23f7bb248";

function surface(overrides: Partial<StatusReadbackLeaseSurface> = {}): StatusReadbackLeaseSurface {
  return {
    surface_id: "live-status-surface",
    head_sha: liveHead,
    verdict: "passing",
    check_run_ids: ["check-1"],
    workflow_run_ids: ["run-1"],
    decisive_successes: ["all live-head checks passed"],
    blocking_failures: [],
    non_blocking_warnings: [],
    ...overrides,
  };
}

function input(overrides: Partial<StatusReadbackAuthorityLeaseInput> = {}): StatusReadbackAuthorityLeaseInput {
  return {
    active_branch: branch,
    status_branch: branch,
    live_head_sha: liveHead,
    previous_lease_head_sha: oldHead,
    previous_lease_surface_ids: ["old-status-surface"],
    spent_lease_ids: [],
    candidate_lease_id: "lease-live-head",
    status_surface: surface(),
    ...overrides,
  };
}

test("admits a current-head lease and expires the previous head", () => {
  const verdict = compileStatusReadbackAuthorityLease(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_current_status_lease");
  assert.equal(verdict.lease_id, "lease-live-head");
  assert.equal(verdict.authority_head_sha, liveHead);
  assert.deepEqual(verdict.expired_head_shas, [oldHead]);
});

test("expires an old lease when the head moved and no new status surface is present", () => {
  const verdict = compileStatusReadbackAuthorityLease(input({ status_surface: undefined }));

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "expire_prior_status_lease");
  assert.equal(verdict.authority_head_sha, null);
  assert.deepEqual(verdict.expired_head_shas, [oldHead]);
});

test("blocks stale status surfaces from older heads", () => {
  const verdict = compileStatusReadbackAuthorityLease(
    input({ status_surface: surface({ surface_id: "old-surface", head_sha: oldHead }) }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_status_surface");
  assert.deepEqual(verdict.expired_head_shas, [oldHead]);
});

test("routes a failing current-head lease to repair", () => {
  const verdict = compileStatusReadbackAuthorityLease(
    input({
      status_surface: surface({
        verdict: "failing",
        decisive_successes: [],
        blocking_failures: ["current-head proof failed"],
      }),
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "route_current_head_repair");
  assert.deepEqual(verdict.blockers, ["current-head proof failed"]);
});

test("blocks replaying a spent lease id", () => {
  const verdict = compileStatusReadbackAuthorityLease(input({ spent_lease_ids: ["lease-live-head"] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_replayed_status_lease");
});
