import assert from "node:assert/strict";
import { test } from "node:test";

import {
  enforceMovedHeadStatusContract,
  type MovedHeadStatusContractInput,
  type MovedHeadStatusSurface,
} from "./moved-head-status-contract.js";

const branch = "monday-platform-genesis-01";
const previousHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const movedHead = "1fa9069be1a2ac7bddf946820244aeb7ed2d5236";
const warning = "Node.js 20 Actions deprecation notice";

function status(overrides: Partial<MovedHeadStatusSurface> = {}): MovedHeadStatusSurface {
  return {
    surface_id: "checks:1fa9069",
    branch,
    head_sha: movedHead,
    verdict: "passing_with_warnings",
    decisive_successes: ["Route Governor Proof succeeded for moved head"],
    blocking_failures: [],
    pending_surfaces: [],
    non_blocking_warnings: [warning],
    ...overrides,
  };
}

function input(overrides: Partial<MovedHeadStatusContractInput> = {}): MovedHeadStatusContractInput {
  return {
    active_branch: branch,
    live_head_sha: movedHead,
    embodiment: {
      receipt_id: "embodiment:75ef61d",
      branch,
      previous_head_sha: previousHead,
      moved_head_sha: movedHead,
      changed_files: ["platform/packages/route-governor/src/moved-head-status-contract.ts"],
      executable_artifacts: ["enforceMovedHeadStatusContract"],
      routing_artifacts: ["status claims must bind to the moved embodiment head"],
      proof_artifacts: ["dist/moved-head-status-contract-proof.js"],
    },
    status: status(),
    ...overrides,
  };
}

test("admits a moved-head passing status surface and preserves warnings", () => {
  const verdict = enforceMovedHeadStatusContract(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_moved_head_status");
  assert.deepEqual(verdict.blockers, []);
  assert.deepEqual(verdict.warnings, [warning]);
  assert.ok(verdict.decisive_evidence.includes("head moved b38ea247602ae8ebba80c4120ad03b41b26bd841 -> 1fa9069be1a2ac7bddf946820244aeb7ed2d5236"));
});

test("blocks stale repaired-head status after an embodiment moved the PR head", () => {
  const verdict = enforceMovedHeadStatusContract(
    input({ status: status({ head_sha: previousHead, surface_id: "checks:b38ea24" }) }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_status_head");
  assert.deepEqual(verdict.blockers, [
    `status head ${previousHead} is not live head ${movedHead}`,
    `status head ${previousHead} is not moved embodiment head ${movedHead}`,
  ]);
});

test("blocks status claims when no moved-head status surface is attached", () => {
  const verdict = enforceMovedHeadStatusContract(input({ status: undefined }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_status_surface");
  assert.deepEqual(verdict.blockers, ["moved-head status contract has no status surface"]);
});

test("routes failing moved-head status to failure detail", () => {
  const verdict = enforceMovedHeadStatusContract(
    input({
      status: status({
        verdict: "failing",
        decisive_successes: [],
        blocking_failures: ["Route governor proof examples failed on moved head"],
        non_blocking_warnings: [warning],
      }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "route_to_failure_detail");
  assert.deepEqual(verdict.blockers, ["Route governor proof examples failed on moved head"]);
  assert.deepEqual(verdict.warnings, [warning]);
});

test("blocks an embodiment receipt that did not move the head", () => {
  const verdict = enforceMovedHeadStatusContract(
    input({
      embodiment: {
        ...input().embodiment,
        previous_head_sha: movedHead,
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_unproven_embodiment_move");
  assert.ok(verdict.blockers.includes("embodiment receipt did not move the head"));
});
