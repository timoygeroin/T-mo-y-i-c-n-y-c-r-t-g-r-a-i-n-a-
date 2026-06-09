import assert from "node:assert/strict";

import {
  compileCurrentHeadRepairAdmission,
  type CurrentHeadRepairAdmissionInput,
} from "./current-head-repair-admission.js";

const branch = "monday-platform-genesis-01";
const head = "85d88b65549a0e8cdc224501b8971d2abf294869";
const failureSignature = "Route governor proof surface failed during Run proof examples";

function input(overrides: Partial<CurrentHeadRepairAdmissionInput> = {}): CurrentHeadRepairAdmissionInput {
  return {
    branch,
    active_branch: branch,
    live_head_sha: head,
    failure_head_sha: head,
    status_verdict: "failing",
    blocking_failures: ["Monday Platform CI / Route governor proof surface: failure"],
    pending_surfaces: [],
    non_blocking_warnings: ["Node.js 20 Actions deprecation notice for checkout/setup/upload-artifact actions"],
    failure_log_surface: {
      available: true,
      source_ids: ["public-checks-current-head-85d88b6"],
      failing_step: "Run proof examples",
      failure_signature: failureSignature,
      assertion_or_error: "proof examples exited 1",
    },
    candidate: {
      changed_files: ["platform/packages/route-governor/src/current-head-repair-admission.ts"],
      executable_artifacts: ["compileCurrentHeadRepairAdmission"],
      routing_artifacts: ["current-head repair admission gate"],
      proof_artifacts: ["dist/current-head-repair-admission-proof.js"],
      repair_class: "current-head-repair-admission-gate",
      addresses_failure_signature: failureSignature,
    },
    spent_repair_classes: ["min-length-json-schema-test-repair"],
    ...overrides,
  };
}

const accepted = compileCurrentHeadRepairAdmission(input());
assert.equal(accepted.ok, true);
assert.equal(accepted.action, "admit_concrete_repair");
assert.match(accepted.next_route, /commit the concrete repair/);

const staleFailure = compileCurrentHeadRepairAdmission(input({ failure_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }));
assert.equal(staleFailure.ok, false);
assert.equal(staleFailure.action, "block_stale_failure");
assert.deepEqual(staleFailure.blockers, [`failure belongs to b38ea247602ae8ebba80c4120ad03b41b26bd841, not live head ${head}`]);

const pending = compileCurrentHeadRepairAdmission(
  input({ status_verdict: "pending", pending_surfaces: ["Route Governor Proof / proof pending"] }),
);
assert.equal(pending.ok, false);
assert.equal(pending.action, "wait_for_checks");

const noStatus = compileCurrentHeadRepairAdmission(input({ status_verdict: "no_status_surface" }));
assert.equal(noStatus.ok, false);
assert.equal(noStatus.action, "require_current_head_status");

const warningOnly = compileCurrentHeadRepairAdmission(input({ status_verdict: "passing_with_warnings", blocking_failures: [] }));
assert.equal(warningOnly.ok, false);
assert.equal(warningOnly.action, "block_warning_only");

const missingLog = compileCurrentHeadRepairAdmission(
  input({ failure_log_surface: { available: true, source_ids: ["checks-page"], failing_step: "Run proof examples" } }),
);
assert.equal(missingLog.ok, false);
assert.equal(missingLog.action, "require_failure_log_surface");
assert.deepEqual(missingLog.blockers, ["current-head failure has no concrete failing step plus assertion/log signature"]);

const missingCandidate = compileCurrentHeadRepairAdmission(input({ candidate: undefined }));
assert.equal(missingCandidate.ok, false);
assert.equal(missingCandidate.action, "block_incomplete_repair");

const repeatedRepair = compileCurrentHeadRepairAdmission(
  input({ spent_repair_classes: ["current-head-repair-admission-gate"] }),
);
assert.equal(repeatedRepair.ok, false);
assert.equal(repeatedRepair.action, "block_repeated_repair");

const unboundRepair = compileCurrentHeadRepairAdmission(
  input({
    candidate: {
      changed_files: ["platform/packages/route-governor/src/current-head-repair-admission.ts"],
      executable_artifacts: ["compileCurrentHeadRepairAdmission"],
      routing_artifacts: ["current-head repair admission gate"],
      proof_artifacts: ["dist/current-head-repair-admission-proof.js"],
      repair_class: "current-head-repair-admission-gate",
      addresses_failure_signature: "different failure",
    },
  }),
);
assert.equal(unboundRepair.ok, false);
assert.equal(unboundRepair.action, "block_incomplete_repair");
assert.deepEqual(unboundRepair.blockers, [`repair candidate does not bind to failure signature: ${failureSignature}`]);

console.log("current-head repair admission proof passed");
