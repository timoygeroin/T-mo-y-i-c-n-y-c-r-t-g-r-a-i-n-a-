import assert from "node:assert/strict";

import {
  compileRuntimeExecutionQueue,
  type RuntimeExecutionQueueInput,
} from "./runtime-execution-queue.js";
import { observeRuntimeExecution, type RuntimeExecutionObservedEvent } from "./runtime-execution-observer.js";
import type { FinalizationRuntimeDispatchVerdict } from "./finalization-runtime-dispatch.js";

const repository = "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-";
const pr = 2;
const branch = "monday-platform-genesis-01";
const head = "609b2be54264aa2bed5b02224e1cead7b82538e1";
const observedMovedHead = "runtime-observer-moved-head";

function dispatch(overrides: Partial<FinalizationRuntimeDispatchVerdict> = {}): FinalizationRuntimeDispatchVerdict {
  return {
    ok: true,
    effect: "execute_external_embodiment_commit",
    repository_full_name: repository,
    pr_number: pr,
    branch,
    head_sha: head,
    command_plan: [
      `${repository}#${pr}`,
      `write ${branch}@${head} through connector_branch_ref_update`,
      "execute runtime class runtime-execution-queue",
    ],
    decisive_evidence: ["runtime-execution-queue", "connector_branch_ref_update"],
    blockers: [],
    next_route: "execute the external embodiment commit, then read only the moved-head status surface",
    ...overrides,
  };
}

function input(overrides: Partial<RuntimeExecutionQueueInput> = {}): RuntimeExecutionQueueInput {
  return {
    dispatch: dispatch(),
    executor_id: "runtime-execution-queue",
    receipt_sink: "memory/monday-external-platform-receipts.md",
    spent_executor_classes: ["scheduled-live-head-admission"],
    ...overrides,
  };
}

const embodiment = compileRuntimeExecutionQueue(input());
assert.equal(embodiment.ok, true);
assert.equal(embodiment.action, "enqueue_external_embodiment");
assert.deepEqual(
  embodiment.steps.map((entry) => entry.kind),
  ["verify_live_head", "write_branch", "record_receipt", "read_moved_head_status"],
);
assert.equal(embodiment.steps[1]?.rollback_on_failure, true);

function observed(stepId: string, status: RuntimeExecutionObservedEvent["status"] = "completed"): RuntimeExecutionObservedEvent {
  const step = embodiment.steps.find((candidate) => candidate.step_id === stepId);
  assert.ok(step);
  return {
    step_id: stepId,
    kind: step.kind,
    command: step.command,
    status,
    produced_head_sha: step.kind === "write_branch" && status === "completed" ? observedMovedHead : undefined,
    evidence: [`${stepId}:${status}`],
  };
}

const observedRequired = [
  observed("verify-live-head"),
  observed("write-external-embodiment"),
  observed("record-execution-receipt"),
];

const observedExecution = observeRuntimeExecution({
  queue: embodiment,
  active_branch: branch,
  pre_execution_head_sha: head,
  post_execution_head_sha: observedMovedHead,
  observed_events: observedRequired,
  status_claim: "none",
});
assert.equal(observedExecution.ok, true);
assert.equal(observedExecution.action, "accept_runtime_execution_observation");
assert.equal(observedExecution.required_status_head_sha, observedMovedHead);

const missingReceiptObservation = observeRuntimeExecution({
  queue: embodiment,
  active_branch: branch,
  pre_execution_head_sha: head,
  post_execution_head_sha: observedMovedHead,
  observed_events: [observed("verify-live-head"), observed("write-external-embodiment")],
  status_claim: "none",
});
assert.equal(missingReceiptObservation.ok, false);
assert.equal(missingReceiptObservation.action, "block_missing_required_step");

const statusSmugglingObservation = observeRuntimeExecution({
  queue: embodiment,
  active_branch: branch,
  pre_execution_head_sha: head,
  post_execution_head_sha: observedMovedHead,
  observed_events: observedRequired,
  status_claim: "passing",
});
assert.equal(statusSmugglingObservation.ok, false);
assert.equal(statusSmugglingObservation.action, "block_status_claim_from_write");

const status = compileRuntimeExecutionQueue(
  input({
    dispatch: dispatch({
      effect: "publish_live_head_status_readback",
      command_plan: [`publish live-head status readback for ${head}`],
      decisive_evidence: ["current-head checks passed"],
    }),
  }),
);
assert.equal(status.ok, true);
assert.equal(status.action, "enqueue_status_publication");
assert.deepEqual(
  status.steps.map((entry) => entry.kind),
  ["verify_live_head", "publish_status", "record_receipt"],
);

const blocker = compileRuntimeExecutionQueue(
  input({
    dispatch: dispatch({
      effect: "publish_exact_external_blocker",
      command_plan: ["publish exact PR-bound blocker"],
      decisive_evidence: ["missing current-head failure log"],
      blockers: ["CURRENT_HEAD_FAILURE_LOG_INSUFFICIENT"],
    }),
  }),
);
assert.equal(blocker.ok, true);
assert.equal(blocker.action, "enqueue_blocker_publication");
assert.deepEqual(blocker.blockers, ["CURRENT_HEAD_FAILURE_LOG_INSUFFICIENT"]);

const blockedDispatch = compileRuntimeExecutionQueue(
  input({
    dispatch: dispatch({
      ok: false,
      effect: "block_runtime_dispatch",
      command_plan: [],
      decisive_evidence: [],
      blockers: ["delivery gate did not produce publishable progress"],
    }),
  }),
);
assert.equal(blockedDispatch.ok, false);
assert.equal(blockedDispatch.action, "block_queue");

const repeatedExecutor = compileRuntimeExecutionQueue(
  input({ spent_executor_classes: ["runtime-execution-queue"] }),
);
assert.equal(repeatedExecutor.ok, false);
assert.equal(repeatedExecutor.action, "block_queue");
assert.deepEqual(repeatedExecutor.blockers, ["runtime executor class already spent: runtime-execution-queue"]);

const missingWriteCommand = compileRuntimeExecutionQueue(
  input({
    dispatch: dispatch({ command_plan: ["execute runtime class runtime-execution-queue"] }),
  }),
);
assert.equal(missingWriteCommand.ok, false);
assert.deepEqual(missingWriteCommand.blockers, ["external embodiment dispatch has no branch write command"]);

console.log("runtime execution queue proof passed");
