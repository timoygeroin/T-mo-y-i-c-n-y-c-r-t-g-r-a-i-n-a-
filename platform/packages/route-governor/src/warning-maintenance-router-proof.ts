import assert from "node:assert/strict";

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

const embodimentFirst = routeWarningMaintenance(input());
assert.equal(embodimentFirst.ok, true);
assert.equal(embodimentFirst.action, "continue_external_embodiment");
assert.match(embodimentFirst.next_route, /warnings remain deferred maintenance/);

const warningRepair = routeWarningMaintenance(input({ requested_move_class: "warning_repair" }));
assert.equal(warningRepair.ok, false);
assert.equal(warningRepair.action, "block_warning_as_repair");

const failingStatus = routeWarningMaintenance(
  input({
    status_verdict: "failing",
    blocking_failures: ["Route Governor Proof / proof examples: failure"],
    requested_move_class: "warning_maintenance",
  }),
);
assert.equal(failingStatus.ok, false);
assert.equal(failingStatus.action, "block_unstable_status");

const queuedMaintenance = routeWarningMaintenance(
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
assert.equal(queuedMaintenance.ok, true);
assert.equal(queuedMaintenance.action, "queue_warning_maintenance");

console.log("warning maintenance router proof passed");
