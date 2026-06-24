import { compileRuntimeExecutionEvidence } from "./runtime-execution-evidence.js";
import type { RuntimeExecutionObservationVerdict } from "./runtime-execution-observer.js";
import type { RuntimeExecutionQueueVerdict } from "./runtime-execution-queue.js";
import type { RuntimeExecutionReceiptVerdict } from "./runtime-execution-receipt.js";

const repository = "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-";
const branch = "monday-platform-genesis-01";
const beforeHead = "ba4f3d92b92d7d8baedb07d58f18d5e1b1bc678c";
const afterHead = "0f7f663f5afc45e80148cf7482a44ac7d83f8f11";
const executor = "runtime-execution-evidence-compiler";

const queue: RuntimeExecutionQueueVerdict = {
  ok: true,
  action: "enqueue_external_embodiment",
  repository_full_name: repository,
  pr_number: 2,
  branch,
  head_sha: beforeHead,
  executor_id: executor,
  steps: [],
  decisive_evidence: ["queued executable embodiment"],
  blockers: [],
  next_route: "execute queued branch write",
};

const observation: RuntimeExecutionObservationVerdict = {
  ok: true,
  action: "accept_runtime_execution_observation",
  repository_full_name: repository,
  pr_number: 2,
  branch,
  previous_head_sha: beforeHead,
  head_sha: afterHead,
  completed_step_ids: ["verify-live-head", "write-external-embodiment", "record-execution-receipt"],
  required_status_head_sha: afterHead,
  decisive_evidence: ["observed branch head movement"],
  blockers: [],
  next_route: `read status only for moved execution head ${afterHead}`,
};

const receipt: RuntimeExecutionReceiptVerdict = {
  ok: true,
  action: "accept_execution_receipt",
  repository_full_name: repository,
  pr_number: 2,
  branch,
  before_head_sha: beforeHead,
  after_head_sha: afterHead,
  executor_id: executor,
  decisive_evidence: ["durable receipt artifact"],
  blockers: [],
  next_route: "read only the moved-head status surface before another embodiment or status claim",
};

const accepted = compileRuntimeExecutionEvidence({ queue, observation, receipt });
if (!accepted.ok || accepted.action !== "accept_runtime_execution_evidence") {
  throw new Error(`runtime execution evidence should accept a bound bundle: ${accepted.blockers.join("; ")}`);
}

const mismatch = compileRuntimeExecutionEvidence({
  queue,
  observation: { ...observation, previous_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" },
  receipt,
});
if (mismatch.ok || mismatch.action !== "block_evidence_mismatch") {
  throw new Error("runtime execution evidence should reject stale previous-head observations");
}

const missingStatus = compileRuntimeExecutionEvidence({
  queue,
  observation: { ...observation, required_status_head_sha: null },
  receipt,
});
if (missingStatus.ok || missingStatus.action !== "block_missing_moved_head_status_obligation") {
  throw new Error("runtime execution evidence should require moved-head status obligation after branch writes");
}

console.log("runtime execution evidence proof passed");
