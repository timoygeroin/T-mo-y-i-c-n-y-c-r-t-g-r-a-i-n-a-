import assert from "node:assert/strict";

import {
  compileStatusReadbackAuthorityLease,
  type StatusReadbackAuthorityLeaseInput,
  type StatusReadbackLeaseSurface,
} from "./status-readback-authority-lease.js";

const branch = "monday-platform-genesis-01";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "be8e3d080cd897038154ec405c6e55e23f7bb248";

function surface(overrides: Partial<StatusReadbackLeaseSurface> = {}): StatusReadbackLeaseSurface {
  return {
    surface_id: "checks-current-live-head",
    head_sha: liveHead,
    verdict: "passing_with_warnings",
    check_run_ids: ["pr-head-status-readback"],
    workflow_run_ids: ["current-head-actions-run"],
    decisive_successes: ["current-head status readback completed"],
    blocking_failures: [],
    non_blocking_warnings: ["Node.js 20 Actions deprecation warning remains non-blocking"],
    ...overrides,
  };
}

function input(overrides: Partial<StatusReadbackAuthorityLeaseInput> = {}): StatusReadbackAuthorityLeaseInput {
  return {
    active_branch: branch,
    status_branch: branch,
    live_head_sha: liveHead,
    previous_lease_head_sha: repairedHead,
    previous_lease_surface_ids: ["b38-repaired-head-checks"],
    spent_lease_ids: [],
    candidate_lease_id: "lease-live-head-be8e3d08",
    status_surface: surface(),
    ...overrides,
  };
}

const currentLease = compileStatusReadbackAuthorityLease(input());
assert.equal(currentLease.ok, true);
assert.equal(currentLease.action, "admit_current_status_lease");
assert.equal(currentLease.authority_head_sha, liveHead);
assert.deepEqual(currentLease.expired_head_shas, [repairedHead]);
assert.match(currentLease.decisive_evidence.join("\n"), /current-head status readback completed/);

const expiredOnly = compileStatusReadbackAuthorityLease(input({ status_surface: undefined }));
assert.equal(expiredOnly.ok, true);
assert.equal(expiredOnly.action, "expire_prior_status_lease");
assert.equal(expiredOnly.authority_head_sha, null);
assert.deepEqual(expiredOnly.expired_head_shas, [repairedHead]);

const staleSurface = compileStatusReadbackAuthorityLease(
  input({ status_surface: surface({ surface_id: "old-repaired-head-status", head_sha: repairedHead }) }),
);
assert.equal(staleSurface.ok, false);
assert.equal(staleSurface.action, "block_missing_status_surface");
assert.match(staleSurface.blockers.join("\n"), /not live head/);

const failingSurface = compileStatusReadbackAuthorityLease(
  input({
    status_surface: surface({
      verdict: "failing",
      decisive_successes: [],
      blocking_failures: ["Route governor proof examples failed on the live head"],
    }),
  }),
);
assert.equal(failingSurface.ok, true);
assert.equal(failingSurface.action, "route_current_head_repair");
assert.deepEqual(failingSurface.blockers, ["Route governor proof examples failed on the live head"]);

const replayedLease = compileStatusReadbackAuthorityLease(input({ spent_lease_ids: ["lease-live-head-be8e3d08"] }));
assert.equal(replayedLease.ok, false);
assert.equal(replayedLease.action, "block_replayed_status_lease");

console.log("status readback authority lease proof passed");
