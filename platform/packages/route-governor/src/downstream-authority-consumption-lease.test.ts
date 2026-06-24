import assert from "node:assert/strict";
import { test } from "node:test";

import {
  consumeDownstreamAuthority,
  type DownstreamAuthorityConsumptionInput,
  type DownstreamStatusAuthorityLease,
} from "./downstream-authority-consumption-lease.js";

const liveHead = "89b66a51cce1730e844806f8d56ddb879fc80833";
const priorStatusHead = "3bf8e07dce32e59accf776357fb22278f57ba3f5";
const branch = "monday-platform-genesis-01";

function statusLease(overrides: Partial<DownstreamStatusAuthorityLease> = {}): DownstreamStatusAuthorityLease {
  return {
    lease_id: "status-lease-live-head-001",
    branch,
    head_sha: liveHead,
    ok: true,
    verdict: "passing_with_warnings",
    evidence: ["Route governor proof examples succeeded", "Node.js 20 warning is non-blocking"],
    blockers: [],
    warnings: ["Node.js 20 Actions deprecation notice"],
    ...overrides,
  };
}

function input(overrides: Partial<DownstreamAuthorityConsumptionInput> = {}): DownstreamAuthorityConsumptionInput {
  return {
    active_branch: branch,
    live_head_sha: liveHead,
    previous_status_head_sha: priorStatusHead,
    authority_id: "downstream-authority-live-head-001",
    spent_authority_ids: [],
    authority_kind: "merge_finalization",
    status_lease: statusLease(),
    ...overrides,
  };
}

test("admits downstream authority only with a current live-head status lease", () => {
  const verdict = consumeDownstreamAuthority(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_downstream_authority");
  assert.equal(verdict.consumed_status_lease_id, "status-lease-live-head-001");
  assert.deepEqual(verdict.blockers, []);
});

test("requires moved-head status before consuming downstream authority", () => {
  const verdict = consumeDownstreamAuthority(input({ status_lease: undefined }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "require_moved_head_status");
  assert.deepEqual(verdict.blockers, [
    `live head ${liveHead} has no status lease after previous status head ${priorStatusHead}`,
  ]);
});

test("blocks stale status leases from older heads", () => {
  const verdict = consumeDownstreamAuthority(
    input({ status_lease: statusLease({ head_sha: priorStatusHead }) }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_status_lease");
  assert.deepEqual(verdict.blockers, [
    `status lease status-lease-live-head-001 belongs to ${priorStatusHead}, not live head ${liveHead}`,
  ]);
});

test("routes failing current-head status to repair instead of merge or review authority", () => {
  const verdict = consumeDownstreamAuthority(
    input({
      authority_kind: "review_request",
      status_lease: statusLease({
        ok: true,
        verdict: "failing",
        blockers: ["Route governor proof examples failed on live head"],
      }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "route_current_head_repair");
  assert.deepEqual(verdict.blockers, ["Route governor proof examples failed on live head"]);
});

test("blocks non-progress downstream authority consumers", () => {
  const verdict = consumeDownstreamAuthority(input({ authority_kind: "metadata_reread" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_progress_authority");
  assert.deepEqual(verdict.blockers, ["metadata_reread cannot consume downstream authority as progress"]);
});

test("emits exact downstream blockers without pretending status authority was consumed", () => {
  const verdict = consumeDownstreamAuthority(
    input({
      authority_kind: "exact_external_blocker",
      status_lease: undefined,
      exact_blocker: "GitHub merge API returned 405: Method Not Allowed",
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "emit_exact_external_blocker");
  assert.equal(verdict.consumed_status_lease_id, null);
  assert.deepEqual(verdict.blockers, ["GitHub merge API returned 405: Method Not Allowed"]);
});

test("blocks replayed downstream authority ids", () => {
  const verdict = consumeDownstreamAuthority(
    input({ spent_authority_ids: ["downstream-authority-live-head-001"] }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_replayed_authority");
  assert.deepEqual(verdict.blockers, ["downstream authority already spent: downstream-authority-live-head-001"]);
});
