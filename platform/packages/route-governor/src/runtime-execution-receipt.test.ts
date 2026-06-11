import assert from "node:assert/strict";
import { test } from "node:test";

import { compileRuntimeExecutionReceipt } from "./runtime-execution-receipt.js";
import type { RuntimeExecutionQueueVerdict } from "./runtime-execution-queue.js";

const repository = "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-";
const branch = "monday-platform-genesis-01";
const beforeHead = "93fd1131fe4ec05a2832254a178a3a1ba9bd8a63";
const afterHead = "9ae8d50add527a6343ae943f826bf6b9a42a95cd";
const executor = "runtime-execution-receipt-gate";

function queue(overrides: Partial<RuntimeExecutionQueueVerdict> = {}): RuntimeExecutionQueueVerdict {
  return {
    ok: true,
    action: "enqueue_external_embodiment",
    repository_full_name: repository,
    pr_number: 2,
    branch,
    head_sha: beforeHead,
    executor_id: executor,
    steps: [
      {
        step_id: "verify-live-head",
        kind: "verify_live_head",
        command: `verify ${branch}@${beforeHead}`,
        required_before_release: true,
        rollback_on_failure: false,
      },
      {
        step_id: "write-external-embodiment",
        kind: "write_branch",
        command: "write runtime execution receipt files",
        required_before_release: true,
        rollback_on_failure: true,
      },
      {
        step_id: "record-execution-receipt",
        kind: "record_receipt",
        command: "record runtime execution receipt",
        required_before_release: true,
        rollback_on_failure: false,
      },
      {
        step_id: "read-moved-head-status",
        kind: "read_moved_head_status",
        command: "read moved-head status",
        required_before_release: false,
        rollback_on_failure: false,
      },
    ],
    decisive_evidence: [executor],
    blockers: [],
    next_route: "execute queued branch write, record receipt, then read moved-head status",
    ...overrides,
  };
}

test("accepts completed runtime execution with a moved embodiment head", () => {
  const verdict = compileRuntimeExecutionReceipt({
    queue: queue(),
    executor_id: executor,
    observed_before_head_sha: beforeHead,
    observed_after_head_sha: afterHead,
    completed_step_ids: ["verify-live-head", "write-external-embodiment", "record-execution-receipt"],
    failed_step_ids: [],
    receipt_artifacts: ["platform/packages/route-governor/src/runtime-execution-receipt.ts"],
  });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "accept_execution_receipt");
  assert.match(verdict.next_route, /moved-head status/);
});

test("blocks receipts from non-executable queues", () => {
  const verdict = compileRuntimeExecutionReceipt({
    queue: queue({ ok: false, blockers: ["dispatch is not executable"] }),
    executor_id: executor,
    observed_before_head_sha: beforeHead,
    observed_after_head_sha: afterHead,
    completed_step_ids: ["verify-live-head", "write-external-embodiment", "record-execution-receipt"],
    failed_step_ids: [],
    receipt_artifacts: ["platform/packages/route-governor/src/runtime-execution-receipt.ts"],
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_queue_not_executable");
  assert.deepEqual(verdict.blockers, ["dispatch is not executable"]);
});

test("blocks receipts bound to the wrong executor or queued head", () => {
  const wrongExecutor = compileRuntimeExecutionReceipt({
    queue: queue(),
    executor_id: "another-executor",
    observed_before_head_sha: beforeHead,
    observed_after_head_sha: afterHead,
    completed_step_ids: ["verify-live-head", "write-external-embodiment", "record-execution-receipt"],
    failed_step_ids: [],
    receipt_artifacts: ["platform/packages/route-governor/src/runtime-execution-receipt.ts"],
  });

  assert.equal(wrongExecutor.ok, false);
  assert.equal(wrongExecutor.action, "block_receipt_mismatch");

  const staleHead = compileRuntimeExecutionReceipt({
    queue: queue(),
    executor_id: executor,
    observed_before_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
    observed_after_head_sha: afterHead,
    completed_step_ids: ["verify-live-head", "write-external-embodiment", "record-execution-receipt"],
    failed_step_ids: [],
    receipt_artifacts: ["platform/packages/route-governor/src/runtime-execution-receipt.ts"],
  });

  assert.equal(staleHead.ok, false);
  assert.equal(staleHead.action, "block_receipt_mismatch");
});

test("blocks failed and missing execution steps", () => {
  const failed = compileRuntimeExecutionReceipt({
    queue: queue(),
    executor_id: executor,
    observed_before_head_sha: beforeHead,
    observed_after_head_sha: afterHead,
    completed_step_ids: ["verify-live-head"],
    failed_step_ids: ["write-external-embodiment"],
    receipt_artifacts: ["platform/packages/route-governor/src/runtime-execution-receipt.ts"],
  });

  assert.equal(failed.ok, false);
  assert.equal(failed.action, "block_failed_step");

  const missing = compileRuntimeExecutionReceipt({
    queue: queue(),
    executor_id: executor,
    observed_before_head_sha: beforeHead,
    observed_after_head_sha: afterHead,
    completed_step_ids: ["verify-live-head", "write-external-embodiment"],
    failed_step_ids: [],
    receipt_artifacts: ["platform/packages/route-governor/src/runtime-execution-receipt.ts"],
  });

  assert.equal(missing.ok, false);
  assert.equal(missing.action, "block_missing_required_steps");
  assert.deepEqual(missing.blockers, ["required execution step not completed: record-execution-receipt"]);
});

test("blocks external embodiment receipts that do not move the branch head", () => {
  const verdict = compileRuntimeExecutionReceipt({
    queue: queue(),
    executor_id: executor,
    observed_before_head_sha: beforeHead,
    observed_after_head_sha: beforeHead,
    completed_step_ids: ["verify-live-head", "write-external-embodiment", "record-execution-receipt"],
    failed_step_ids: [],
    receipt_artifacts: ["platform/packages/route-governor/src/runtime-execution-receipt.ts"],
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_unmoved_embodiment_head");
});
