import assert from "node:assert/strict";

import { observeRuntimeExecution, type RuntimeExecutionObservedEvent } from "./runtime-execution-observer.js";
import type { RuntimeExecutionQueueVerdict } from "./runtime-execution-queue.js";

const repository = "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-";
const pr = 2;
const branch = "monday-platform-genesis-01";
const head = "2ec13107c435753f72749e75dea55da54e50cfa2";
const movedHead = "runtime-observer-moved-head";

const queue: RuntimeExecutionQueueVerdict = {
  ok: true,
  action: "enqueue_external_embodiment",
  repository_full_name: repository,
  pr_number: pr,
  branch,
  head_sha: head,
  executor_id: "runtime-execution-observer",
  steps: [
    {
      step_id: "verify-live-head",
      kind: "verify_live_head",
      command: `verify ${branch}@${head}`,
      required_before_release: true,
      rollback_on_failure: false,
    },
    {
      step_id: "write-external-embodiment",
      kind: "write_branch",
      command: `write ${branch}@${head}`,
      required_before_release: true,
      rollback_on_failure: true,
    },
    {
      step_id: "record-execution-receipt",
      kind: "record_receipt",
      command: "record external embodiment receipt",
      required_before_release: true,
      rollback_on_failure: false,
    },
    {
      step_id: "read-moved-head-status",
      kind: "read_moved_head_status",
      command: "read only moved-head status",
      required_before_release: false,
      rollback_on_failure: false,
    },
  ],
  decisive_evidence: ["runtime execution queue accepted"],
  blockers: [],
  next_route: "execute queued branch write",
};

function observed(step_id: string, status: RuntimeExecutionObservedEvent["status"] = "completed"): RuntimeExecutionObservedEvent {
  const step = queue.steps.find((candidate) => candidate.step_id === step_id);
  assert.ok(step);
  return {
    step_id,
    kind: step.kind,
    command: step.command,
    status,
    produced_head_sha: step.kind === "write_branch" && status === "completed" ? movedHead : undefined,
    evidence: [`${step_id}:${status}`],
  };
}

const completeRequired = [
  observed("verify-live-head"),
  observed("write-external-embodiment"),
  observed("record-execution-receipt"),
];

const accepted = observeRuntimeExecution({
  queue,
  active_branch: branch,
  pre_execution_head_sha: head,
  post_execution_head_sha: movedHead,
  observed_events: completeRequired,
  status_claim: "none",
});
assert.equal(accepted.ok, true);
assert.equal(accepted.action, "accept_runtime_execution_observation");
assert.equal(accepted.required_status_head_sha, movedHead);

const missingReceipt = observeRuntimeExecution({
  queue,
  active_branch: branch,
  pre_execution_head_sha: head,
  post_execution_head_sha: movedHead,
  observed_events: [observed("verify-live-head"), observed("write-external-embodiment")],
  status_claim: "none",
});
assert.equal(missingReceipt.ok, false);
assert.equal(missingReceipt.action, "block_missing_required_step");

const failedWrite = observeRuntimeExecution({
  queue,
  active_branch: branch,
  pre_execution_head_sha: head,
  post_execution_head_sha: head,
  observed_events: [observed("verify-live-head"), observed("write-external-embodiment", "failed")],
  status_claim: "none",
});
assert.equal(failedWrite.ok, false);
assert.equal(failedWrite.action, "block_failed_required_step");

const statusSmuggling = observeRuntimeExecution({
  queue,
  active_branch: branch,
  pre_execution_head_sha: head,
  post_execution_head_sha: movedHead,
  observed_events: completeRequired,
  status_claim: "passing",
});
assert.equal(statusSmuggling.ok, false);
assert.equal(statusSmuggling.action, "block_status_claim_from_write");

console.log("runtime execution observer proof passed");
