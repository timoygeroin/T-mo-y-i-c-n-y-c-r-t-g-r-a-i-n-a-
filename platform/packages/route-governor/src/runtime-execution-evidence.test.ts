import assert from "node:assert/strict";
import { test } from "node:test";

import { compileRuntimeExecutionEvidence } from "./runtime-execution-evidence.js";
import type { RuntimeExecutionObservationVerdict } from "./runtime-execution-observer.js";
import type { RuntimeExecutionQueueVerdict } from "./runtime-execution-queue.js";
import type { RuntimeExecutionReceiptVerdict } from "./runtime-execution-receipt.js";

const repository = "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-";
const branch = "monday-platform-genesis-01";
const beforeHead = "ba4f3d92b92d7d8baedb07d58f18d5e1b1bc678c";
const afterHead = "0f7f663f5afc45e80148cf7482a44ac7d83f8f11";
const executor = "runtime-execution-evidence-compiler";

function queue(overrides: Partial<RuntimeExecutionQueueVerdict> = {}): RuntimeExecutionQueueVerdict {
  return {
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
    ...overrides,
  };
}

function observation(overrides: Partial<RuntimeExecutionObservationVerdict> = {}): RuntimeExecutionObservationVerdict {
  return {
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
    ...overrides,
  };
}

function receipt(overrides: Partial<RuntimeExecutionReceiptVerdict> = {}): RuntimeExecutionReceiptVerdict {
  return {
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
    ...overrides,
  };
}

test("accepts a bound queue observation and receipt bundle", () => {
  const verdict = compileRuntimeExecutionEvidence({
    queue: queue(),
    observation: observation(),
    receipt: receipt(),
  });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "accept_runtime_execution_evidence");
  assert.equal(verdict.status_head_required_before_next_claim, afterHead);
  assert.ok(verdict.decisive_evidence.includes(`head transition ${beforeHead} -> ${afterHead}`));
});

test("blocks if any component is not accepted", () => {
  const verdict = compileRuntimeExecutionEvidence({
    queue: queue(),
    observation: observation({ ok: false, blockers: ["required execution step missing: record-execution-receipt"] }),
    receipt: receipt(),
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_observation_not_accepted");
  assert.deepEqual(verdict.blockers, ["required execution step missing: record-execution-receipt"]);
});

test("blocks mismatched head transition evidence", () => {
  const verdict = compileRuntimeExecutionEvidence({
    queue: queue(),
    observation: observation({ head_sha: "1111111111111111111111111111111111111111" }),
    receipt: receipt(),
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_evidence_mismatch");
  assert.ok(verdict.blockers.some((blocker) => blocker.includes("does not match receipt after head")));
});

test("blocks external embodiment evidence without moved-head status obligation", () => {
  const verdict = compileRuntimeExecutionEvidence({
    queue: queue(),
    observation: observation({ required_status_head_sha: null }),
    receipt: receipt(),
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_moved_head_status_obligation");
});

test("blocks required moved-head status surfaces bound to another head", () => {
  const verdict = compileRuntimeExecutionEvidence({
    queue: queue(),
    observation: observation(),
    receipt: receipt(),
    require_moved_head_status_surface: true,
    moved_head_status_surface_head_sha: beforeHead,
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_moved_head_status_obligation");
  assert.deepEqual(verdict.blockers, [`moved-head status surface missing for ${afterHead}`]);
});
