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

const accepted = compileRuntimeExecutionReceipt({
  queue: queue(),
  executor_id: executor,
  observed_before_head_sha: beforeHead,
  observed_after_head_sha: afterHead,
  completed_step_ids: ["verify-live-head", "write-external-embodiment", "record-execution-receipt"],
  failed_step_ids: [],
  receipt_artifacts: ["platform/packages/route-governor/src/runtime-execution-receipt.ts"],
});
if (!accepted.ok || accepted.action !== "accept_execution_receipt") {
  throw new Error(`runtime execution receipt should accept completed execution: ${accepted.blockers.join("; ")}`);
}

const missing = compileRuntimeExecutionReceipt({
  queue: queue(),
  executor_id: executor,
  observed_before_head_sha: beforeHead,
  observed_after_head_sha: afterHead,
  completed_step_ids: ["verify-live-head", "write-external-embodiment"],
  failed_step_ids: [],
  receipt_artifacts: ["platform/packages/route-governor/src/runtime-execution-receipt.ts"],
});
if (missing.ok || missing.action !== "block_missing_required_steps") {
  throw new Error("runtime execution receipt should reject missing required steps");
}

const unmoved = compileRuntimeExecutionReceipt({
  queue: queue(),
  executor_id: executor,
  observed_before_head_sha: beforeHead,
  observed_after_head_sha: beforeHead,
  completed_step_ids: ["verify-live-head", "write-external-embodiment", "record-execution-receipt"],
  failed_step_ids: [],
  receipt_artifacts: ["platform/packages/route-governor/src/runtime-execution-receipt.ts"],
});
if (unmoved.ok || unmoved.action !== "block_unmoved_embodiment_head") {
  throw new Error("runtime execution receipt should reject unmoved embodiment heads");
}

console.log("runtime execution receipt proof passed");
