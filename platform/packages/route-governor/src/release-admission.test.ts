import test from "node:test";
import assert from "node:assert/strict";

import { admitContinuationRelease } from "./release-admission.js";
import {
  compileContinuationReleaseReceipt,
  selectNextContinuationMove,
  type ContinuationMoveInput,
  type ContinuationReleaseReceipt,
  type ContinuationStatusReceiptSurface,
} from "./index.js";

const branch = "monday-platform-genesis-01";
const previousHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const currentHead = "a8162dcc2ff3e8dcbee79926407ce0cbd9ae6638";

function continuationInput(overrides: Partial<ContinuationMoveInput> = {}): ContinuationMoveInput {
  return {
    move_class: "external_platform_embodiment",
    current_head_sha: currentHead,
    previous_readback_head_sha: previousHead,
    changed_files: ["platform/packages/route-governor/src/release-admission.ts"],
    executable_artifacts: ["admitContinuationRelease"],
    routing_artifacts: ["release admission guard"],
    new_check_run_ids: [],
    ...overrides,
  };
}

function receiptFor(input: ContinuationMoveInput, status_surface?: ContinuationStatusReceiptSurface): ContinuationReleaseReceipt {
  return compileContinuationReleaseReceipt({
    branch,
    current_head_sha: input.current_head_sha,
    preflight: selectNextContinuationMove([{ candidate_id: "candidate", input }]),
    status_surface,
  });
}

function admission(receipt: ContinuationReleaseReceipt, expectedHead = receipt.head_sha) {
  return admitContinuationRelease({
    expected_branch: branch,
    expected_head_sha: expectedHead,
    receipt,
  });
}

test("admits an external embodiment receipt without pretending status was read", () => {
  const verdict = admission(receiptFor(continuationInput()));

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "publish_external_embodiment");
  assert.equal(verdict.release_class, "external_embodiment");
  assert.deepEqual(verdict.blockers, []);
  assert.ok(verdict.decisive_evidence.includes("admitContinuationRelease"));
});

test("blocks a receipt whose head no longer matches the expected PR head", () => {
  const verdict = admission(receiptFor(continuationInput()), "newer-head");

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_release");
  assert.deepEqual(verdict.blockers, [`receipt head ${currentHead} does not match expected head newer-head`]);
});

test("blocks a moved-head status readback receipt without an attached status surface", () => {
  const receipt = receiptFor(
    continuationInput({
      move_class: "fresh_status_readback",
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
    }),
  );
  const verdict = admission(receipt);

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_release");
  assert.deepEqual(verdict.blockers, ["fresh status readback selected without an attached current-head status surface"]);
});

test("admits a current-head passing status receipt while preserving warnings", () => {
  const receipt = receiptFor(
    continuationInput({
      move_class: "fresh_status_readback",
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      new_check_run_ids: ["current-check"],
      new_check_runs: [{ id: "current-check", head_sha: currentHead }],
    }),
    {
      verdict: "passing_with_warnings",
      ok: true,
      decisive_successes: ["Route Governor Proof / proof examples: success"],
      blocking_failures: [],
      pending_surfaces: [],
      non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
    },
  );
  const verdict = admission(receipt);

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "publish_fresh_status_readback");
  assert.deepEqual(verdict.blockers, []);
  assert.deepEqual(verdict.warnings, ["Node.js 20 Actions deprecation notice"]);
  assert.ok(verdict.decisive_evidence.includes("Route Governor Proof / proof examples: success"));
});

test("admits an exact external blocker as a valid blocker release", () => {
  const receipt = receiptFor(
    continuationInput({
      move_class: "exact_external_blocker",
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      blocker: "GitHub Actions status surface is unavailable for current head",
    }),
  );
  const verdict = admission(receipt);

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "publish_exact_blocker");
  assert.deepEqual(verdict.blockers, ["GitHub Actions status surface is unavailable for current head"]);
});

test("blocks receipts with no decisive evidence", () => {
  const receipt = receiptFor(continuationInput());
  const verdict = admission({ ...receipt, decisive_evidence: [] });

  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.blockers, ["release receipt has no decisive evidence"]);
});
