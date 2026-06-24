import assert from "node:assert/strict";

import { compileLeaseConsumptionOrder } from "./lease-consumption-order.js";

const head = "2bacef1bd3d9d7b61a53aea24ba5ae3a00b9f2aa";
const branch = "monday-platform-genesis-01";

const admitted = compileLeaseConsumptionOrder({
  active_branch: branch,
  live_head_sha: head,
  plan_id: "lease-consumption-order-live-head-001",
  spent_plan_ids: [],
  requested_next_action: "merge_command",
  required_order: ["status_surface", "review_feedback_delta", "mergeability_lease"],
  leases: [
    {
      lease_id: "status-lease",
      kind: "status_surface",
      branch,
      head_sha: head,
      ok: true,
      observed_sequence: 1,
      evidence: ["status readback belongs to live head"],
      blockers: [],
    },
    {
      lease_id: "review-lease",
      kind: "review_feedback_delta",
      branch,
      head_sha: head,
      ok: true,
      observed_sequence: 2,
      evidence: ["review feedback belongs to live head"],
      blockers: [],
    },
    {
      lease_id: "mergeability-lease",
      kind: "mergeability_lease",
      branch,
      head_sha: head,
      ok: true,
      observed_sequence: 3,
      evidence: ["mergeability true"],
      blockers: [],
    },
  ],
});

assert.equal(admitted.ok, true);
assert.equal(admitted.action, "admit_lease_consumption_order");
assert.deepEqual(
  admitted.ordered_leases.map((lease) => lease.lease_id),
  ["status-lease", "review-lease", "mergeability-lease"],
);

const stale = compileLeaseConsumptionOrder({
  active_branch: branch,
  live_head_sha: head,
  plan_id: "lease-consumption-order-live-head-002",
  spent_plan_ids: [],
  requested_next_action: "merge_command",
  required_order: ["status_surface", "mergeability_lease"],
  leases: [
    {
      lease_id: "old-status",
      kind: "status_surface",
      branch,
      head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
      ok: true,
      observed_sequence: 1,
      evidence: ["repaired historical head status"],
      blockers: [],
    },
    {
      lease_id: "mergeability-lease",
      kind: "mergeability_lease",
      branch,
      head_sha: head,
      ok: true,
      observed_sequence: 2,
      evidence: ["mergeability true"],
      blockers: [],
    },
  ],
});

assert.equal(stale.ok, false);
assert.equal(stale.action, "block_stale_head");

const outOfOrder = compileLeaseConsumptionOrder({
  active_branch: branch,
  live_head_sha: head,
  plan_id: "lease-consumption-order-live-head-003",
  spent_plan_ids: [],
  requested_next_action: "merge_command",
  required_order: ["status_surface", "mergeability_lease"],
  leases: [
    {
      lease_id: "status-lease",
      kind: "status_surface",
      branch,
      head_sha: head,
      ok: true,
      observed_sequence: 5,
      evidence: ["status readback"],
      blockers: [],
    },
    {
      lease_id: "mergeability-lease",
      kind: "mergeability_lease",
      branch,
      head_sha: head,
      ok: true,
      observed_sequence: 4,
      evidence: ["mergeability true"],
      blockers: [],
    },
  ],
});

assert.equal(outOfOrder.ok, false);
assert.equal(outOfOrder.action, "block_non_monotonic_order");

const nonProgress = compileLeaseConsumptionOrder({
  active_branch: branch,
  live_head_sha: head,
  plan_id: "lease-consumption-order-live-head-004",
  spent_plan_ids: [],
  requested_next_action: "duplicate_status_summary",
  required_order: ["status_surface"],
  leases: [
    {
      lease_id: "status-lease",
      kind: "status_surface",
      branch,
      head_sha: head,
      ok: true,
      observed_sequence: 1,
      evidence: ["status readback"],
      blockers: [],
    },
  ],
});

assert.equal(nonProgress.ok, false);
assert.equal(nonProgress.action, "block_non_progress_action");
