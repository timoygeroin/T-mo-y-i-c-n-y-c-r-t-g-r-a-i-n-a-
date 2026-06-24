import test from "node:test";
import assert from "node:assert/strict";

import { compileLeaseConsumptionOrder, type LeaseConsumptionSurface } from "./lease-consumption-order.js";

const branch = "monday-platform-genesis-01";
const head = "2bacef1bd3d9d7b61a53aea24ba5ae3a00b9f2aa";

function lease(overrides: Partial<LeaseConsumptionSurface> = {}): LeaseConsumptionSurface {
  return {
    lease_id: "status-lease",
    kind: "status_surface",
    branch,
    head_sha: head,
    ok: true,
    observed_sequence: 1,
    evidence: ["status readback"],
    blockers: [],
    ...overrides,
  };
}

test("admits required leases in monotonic live-head order", () => {
  const verdict = compileLeaseConsumptionOrder({
    active_branch: branch,
    live_head_sha: head,
    plan_id: "lease-plan-001",
    spent_plan_ids: [],
    requested_next_action: "merge_command",
    required_order: ["status_surface", "review_feedback_delta"],
    leases: [
      lease(),
      lease({
        lease_id: "review-lease",
        kind: "review_feedback_delta",
        observed_sequence: 2,
        evidence: ["review feedback"],
      }),
    ],
  });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_lease_consumption_order");
  assert.deepEqual(
    verdict.ordered_leases.map((item) => item.kind),
    ["status_surface", "review_feedback_delta"],
  );
});

test("blocks duplicate required lease kinds", () => {
  const verdict = compileLeaseConsumptionOrder({
    active_branch: branch,
    live_head_sha: head,
    plan_id: "lease-plan-002",
    spent_plan_ids: [],
    requested_next_action: "merge_command",
    required_order: ["status_surface"],
    leases: [lease(), lease({ lease_id: "second-status", observed_sequence: 2 })],
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_duplicate_required_lease");
});

test("blocks failed leases before consumption", () => {
  const verdict = compileLeaseConsumptionOrder({
    active_branch: branch,
    live_head_sha: head,
    plan_id: "lease-plan-003",
    spent_plan_ids: [],
    requested_next_action: "merge_command",
    required_order: ["status_surface"],
    leases: [lease({ ok: false, blockers: ["status lease failed"] })],
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_failed_lease");
  assert.deepEqual(verdict.blockers, ["status lease failed"]);
});
