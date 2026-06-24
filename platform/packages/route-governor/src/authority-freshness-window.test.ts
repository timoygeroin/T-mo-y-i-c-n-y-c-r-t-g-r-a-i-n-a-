import test from "node:test";
import assert from "node:assert/strict";

import {
  compileAuthorityFreshnessWindow,
  type AuthorityFreshnessLease,
} from "./authority-freshness-window.js";

const branch = "monday-platform-genesis-01";
const head = "283d88dcd9eb2f116479a0b97418281215773bb5";

function lease(overrides: Partial<AuthorityFreshnessLease> = {}): AuthorityFreshnessLease {
  return {
    lease_id: "status-lease-001",
    kind: "status_lease",
    branch,
    head_sha: head,
    observed_at: "2026-06-22T01:10:00.000Z",
    evidence: ["Route Governor Proof succeeded"],
    ...overrides,
  };
}

test("admits same-head authority when every required lease is newer than invalidations", () => {
  const verdict = compileAuthorityFreshnessWindow({
    active_branch: branch,
    live_head_sha: head,
    required_lease_kinds: ["status_lease", "mergeability_lease", "review_lease"],
    leases: [
      lease(),
      lease({ lease_id: "mergeability-lease-001", kind: "mergeability_lease" }),
      lease({ lease_id: "review-lease-001", kind: "review_lease" }),
    ],
    invalidation_events: [
      {
        event_id: "status-rerun-000",
        kind: "status_rerun_started",
        branch,
        head_sha: head,
        occurred_at: "2026-06-22T01:09:00.000Z",
        evidence: ["older rerun started before current leases"],
      },
    ],
  });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_authority_freshness_window");
  assert.deepEqual(verdict.admitted_lease_ids, ["status-lease-001", "mergeability-lease-001", "review-lease-001"]);
});

test("expires same-head authority when a newer invalidation event appears", () => {
  const verdict = compileAuthorityFreshnessWindow({
    active_branch: branch,
    live_head_sha: head,
    required_lease_kinds: ["status_lease", "review_lease"],
    leases: [
      lease({ lease_id: "status-before-rerun", kind: "status_lease", observed_at: "2026-06-22T01:10:00.000Z" }),
      lease({ lease_id: "review-before-rerun", kind: "review_lease", observed_at: "2026-06-22T01:11:00.000Z" }),
    ],
    invalidation_events: [
      {
        event_id: "review-dismissal-001",
        kind: "review_dismissed",
        branch,
        head_sha: head,
        occurred_at: "2026-06-22T01:12:00.000Z",
        evidence: ["review dismissed after leases were compiled"],
      },
    ],
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "expire_stale_same_head_authority");
  assert.deepEqual(verdict.expired_lease_ids, ["status-before-rerun", "review-before-rerun"]);
  assert.match(verdict.blockers[0], /older than review_dismissed/);
});

test("blocks stale head authority before timestamp freshness is considered", () => {
  const verdict = compileAuthorityFreshnessWindow({
    active_branch: branch,
    live_head_sha: head,
    required_lease_kinds: ["status_lease"],
    leases: [lease({ head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" })],
    invalidation_events: [],
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_head_mismatch");
  assert.match(verdict.blockers[0], /not live head/);
});

test("blocks missing required lease kinds", () => {
  const verdict = compileAuthorityFreshnessWindow({
    active_branch: branch,
    live_head_sha: head,
    required_lease_kinds: ["status_lease", "blocker_retirement"],
    leases: [lease({ kind: "status_lease" })],
    invalidation_events: [],
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_required_lease");
  assert.deepEqual(verdict.blockers, ["missing authority lease: blocker_retirement"]);
});

test("blocks unparseable timestamps instead of guessing freshness", () => {
  const verdict = compileAuthorityFreshnessWindow({
    active_branch: branch,
    live_head_sha: head,
    required_lease_kinds: ["status_lease"],
    leases: [lease({ observed_at: "not-a-date" })],
    invalidation_events: [],
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_unparseable_timestamp");
  assert.match(verdict.blockers[0], /unparseable timestamp/);
});
