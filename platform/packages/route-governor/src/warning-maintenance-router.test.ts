import assert from "node:assert/strict";
import { test } from "node:test";

import { routeWarningMaintenance, type WarningMaintenanceRouterInput } from "./warning-maintenance-router.js";

const branch = "monday-platform-genesis-01";
const head = "0a74ac16335540324af640b0bf9f310180cb2703";
const warning = "Node.js 20 Actions deprecation notice for checkout/setup/upload-artifact actions";

function input(overrides: Partial<WarningMaintenanceRouterInput> = {}): WarningMaintenanceRouterInput {
  return {
    branch,
    active_branch: branch,
    live_head_sha: head,
    status_head_sha: head,
    status_verdict: "passing_with_warnings",
    non_blocking_warnings: [warning],
    blocking_failures: [],
    pending_surfaces: [],
    requested_move_class: "external_platform_embodiment",
    spent_maintenance_ids: [],
    ...overrides,
  };
}

test("continues external embodiment when only non-blocking warnings remain", () => {
  const verdict = routeWarningMaintenance(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "continue_external_embodiment");
  assert.deepEqual(verdict.blockers, []);
  assert.match(verdict.next_route, /warnings remain deferred maintenance/);
});

test("blocks treating a non-blocking warning as a repair", () => {
  const verdict = routeWarningMaintenance(input({ requested_move_class: "warning_repair" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_warning_as_repair");
  assert.deepEqual(verdict.blockers, [`non-blocking warning cannot enter repair mode: ${warning}`]);
});

test("blocks warning maintenance while current-head checks are failing", () => {
  const verdict = routeWarningMaintenance(
    input({
      status_verdict: "failing",
      blocking_failures: ["Route Governor Proof / proof examples: failure"],
      requested_move_class: "warning_maintenance",
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_unstable_status");
  assert.deepEqual(verdict.blockers, ["Route Governor Proof / proof examples: failure"]);
});

test("blocks stale warning status from an older head", () => {
  const verdict = routeWarningMaintenance(input({ status_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_unstable_status");
  assert.deepEqual(verdict.blockers, [
    `warning status belongs to b38ea247602ae8ebba80c4120ad03b41b26bd841, not live head ${head}`,
  ]);
});

test("queues executable warning maintenance when explicitly selected", () => {
  const verdict = routeWarningMaintenance(
    input({
      requested_move_class: "warning_maintenance",
      candidate: {
        maintenance_id: "node20-actions-runtime-warning-maintenance",
        warning_signature: warning,
        changed_files: ["platform/packages/route-governor/src/warning-maintenance-router.ts"],
        executable_artifacts: ["routeWarningMaintenance"],
        routing_artifacts: ["warning maintenance is deferred below embodiment and concrete failure repair"],
        proof_artifacts: ["dist/warning-maintenance-router-proof.js"],
      },
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "queue_warning_maintenance");
  assert.deepEqual(verdict.blockers, []);
  assert.ok(verdict.decisive_evidence.includes("node20-actions-runtime-warning-maintenance"));
});

test("blocks repeated warning maintenance ids", () => {
  const verdict = routeWarningMaintenance(
    input({
      requested_move_class: "warning_maintenance",
      spent_maintenance_ids: ["node20-actions-runtime-warning-maintenance"],
      candidate: {
        maintenance_id: "node20-actions-runtime-warning-maintenance",
        warning_signature: warning,
        changed_files: ["platform/packages/route-governor/src/warning-maintenance-router.ts"],
        executable_artifacts: ["routeWarningMaintenance"],
        routing_artifacts: ["warning maintenance is deferred below embodiment and concrete failure repair"],
        proof_artifacts: ["dist/warning-maintenance-router-proof.js"],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_repeated_maintenance");
  assert.deepEqual(verdict.blockers, ["warning maintenance id already spent: node20-actions-runtime-warning-maintenance"]);
});
