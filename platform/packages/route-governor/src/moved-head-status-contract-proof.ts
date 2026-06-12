import assert from "node:assert/strict";

import {
  enforceMovedHeadStatusContract,
  type MovedHeadStatusContractInput,
} from "./moved-head-status-contract.js";

const branch = "monday-platform-genesis-01";
const previousHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const movedHead = "1fa9069be1a2ac7bddf946820244aeb7ed2d5236";

const input: MovedHeadStatusContractInput = {
  active_branch: branch,
  live_head_sha: movedHead,
  embodiment: {
    receipt_id: "moved-head-status-contract-proof",
    branch,
    previous_head_sha: previousHead,
    moved_head_sha: movedHead,
    changed_files: ["platform/packages/route-governor/src/moved-head-status-contract.ts"],
    executable_artifacts: ["enforceMovedHeadStatusContract"],
    routing_artifacts: ["stale repaired-head status cannot steer after a moved embodiment head"],
    proof_artifacts: ["dist/moved-head-status-contract-proof.js"],
  },
  status: {
    surface_id: "checks:moved-head-proof",
    branch,
    head_sha: movedHead,
    verdict: "passing_with_warnings",
    decisive_successes: ["all moved-head route-governor checks succeeded"],
    blocking_failures: [],
    pending_surfaces: [],
    non_blocking_warnings: ["Node.js 20 Actions deprecation notice remains non-blocking"],
  },
};

const admitted = enforceMovedHeadStatusContract(input);
assert.equal(admitted.ok, true);
assert.equal(admitted.action, "admit_moved_head_status");
assert.deepEqual(admitted.blockers, []);
assert.deepEqual(admitted.warnings, ["Node.js 20 Actions deprecation notice remains non-blocking"]);

const stale = enforceMovedHeadStatusContract({
  ...input,
  status: {
    ...input.status!,
    surface_id: "checks:resolved-repaired-head",
    head_sha: previousHead,
  },
});
assert.equal(stale.ok, false);
assert.equal(stale.action, "block_stale_status_head");
assert.ok(stale.blockers.some((blocker) => blocker.includes(previousHead)));

console.log("moved-head status contract proof passed");
