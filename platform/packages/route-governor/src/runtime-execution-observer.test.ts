import test from "node:test";
import assert from "node:assert/strict";

import { observeRuntimeExecution, type RuntimeExecutionObservedEvent } from "./runtime-execution-observer.js";
import type { RuntimeExecutionQueueVerdict } from "./runtime-execution-queue.js";

const repository = "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-";
const pr = 2;
const branch = "monday-platform-genesis-01";
const head = "2ec13107c435753f72749e75dea55da54e50cfa2";
const movedHead = "1b56d6c61328c25f77caafe81322ecda242d38ec";

function queue(overrides: Partial<RuntimeExecutionQueueVerdict> = {}): RuntimeExecutionQueueVerdict {
  return {
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
    decisive_evidence: ["runtime execution queue"],
    blockers: [],
    next_route: "execute queued branch write",
    ...overrides,
  };
}

function event(step_id: string, status: RuntimeExecutionObservedEvent["status"] = "completed"): RuntimeExecutionObservedEvent {
  const step = queue().steps.find((entry) => entry.step_id === step_id);
  assert.ok(step);
  return {
    step_id,
    kind: step.kind,
    command: step.command,
    status,
    produced_head_sha: step.kind === "write_branch" && status === "completed" ? movedHead : undefined,
    evidence: [`${step_id} ${status}`],
  };
}

const completedRequired = [
  event("verify-live-head"),
  event("write-external-embodiment"),
  event("record-execution-receipt"),
];

test("accepts observed execution only after required steps complete and head moves", () => {
  const verdict = observeRuntimeExecution({
    queue: queue(),
    active_branch: branch,
    pre_execution_head_sha: head,
    post_execution_head_sha: movedHead,
    observed_events: completedRequired,
    status_claim: "none",
  });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "accept_runtime_execution_observation");
  assert.equal(verdict.required_status_head_sha, movedHead);
  assert.ok(verdict.decisive_evidence.some((entry) => entry.includes(`head moved from ${head} to ${movedHead}`)));
});

test("blocks missing required execution steps", () => {
  const verdict = observeRuntimeExecution({
    queue: queue(),
    active_branch: branch,
    pre_execution_head_sha: head,
    post_execution_head_sha: movedHead,
    observed_events: [event("verify-live-head"), event("write-external-embodiment")],
    status_claim: "none",
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_required_step");
  assert.deepEqual(verdict.blockers, ["required execution step missing: record-execution-receipt"]);
});

test("blocks failed required execution steps", () => {
  const verdict = observeRuntimeExecution({
    queue: queue(),
    active_branch: branch,
    pre_execution_head_sha: head,
    post_execution_head_sha: head,
    observed_events: [event("verify-live-head"), event("write-external-embodiment", "failed")],
    status_claim: "none",
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_failed_required_step");
  assert.deepEqual(verdict.blockers, ["required execution step failed: write-external-embodiment"]);
});

test("blocks branch writes that do not move the head", () => {
  const verdict = observeRuntimeExecution({
    queue: queue(),
    active_branch: branch,
    pre_execution_head_sha: head,
    post_execution_head_sha: head,
    observed_events: completedRequired,
    status_claim: "none",
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_unmoved_write_head");
});

test("blocks status claims smuggled through branch writes", () => {
  const verdict = observeRuntimeExecution({
    queue: queue(),
    active_branch: branch,
    pre_execution_head_sha: head,
    post_execution_head_sha: movedHead,
    observed_events: completedRequired,
    status_claim: "passing",
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_status_claim_from_write");
  assert.deepEqual(verdict.blockers, ["branch write attempted to carry status claim: passing"]);
});

test("blocks unplanned observed events", () => {
  const verdict = observeRuntimeExecution({
    queue: queue(),
    active_branch: branch,
    pre_execution_head_sha: head,
    post_execution_head_sha: movedHead,
    observed_events: [
      ...completedRequired,
      {
        step_id: "post-extra-comment",
        kind: "record_receipt",
        command: "post duplicate comment",
        status: "completed",
        evidence: ["duplicate comment"],
      },
    ],
    status_claim: "none",
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_unplanned_event");
});
