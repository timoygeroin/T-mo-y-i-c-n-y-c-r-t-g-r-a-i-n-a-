import type { RuntimeExecutionQueueVerdict, RuntimeExecutionStep } from "./runtime-execution-queue.js";

export type RuntimeExecutionReceiptAction =
  | "accept_execution_receipt"
  | "block_queue_not_executable"
  | "block_missing_required_steps"
  | "block_failed_step"
  | "block_unmoved_embodiment_head"
  | "block_receipt_mismatch";

export interface RuntimeExecutionReceiptInput {
  queue: RuntimeExecutionQueueVerdict;
  executor_id: string;
  observed_before_head_sha: string;
  observed_after_head_sha: string;
  completed_step_ids: string[];
  failed_step_ids: string[];
  receipt_artifacts: string[];
}

export interface RuntimeExecutionReceiptVerdict {
  ok: boolean;
  action: RuntimeExecutionReceiptAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  before_head_sha: string;
  after_head_sha: string;
  executor_id: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function base(input: RuntimeExecutionReceiptInput): Pick<
  RuntimeExecutionReceiptVerdict,
  "repository_full_name" | "pr_number" | "branch" | "before_head_sha" | "after_head_sha" | "executor_id"
> {
  return {
    repository_full_name: input.queue.repository_full_name,
    pr_number: input.queue.pr_number,
    branch: input.queue.branch,
    before_head_sha: input.observed_before_head_sha,
    after_head_sha: input.observed_after_head_sha,
    executor_id: input.executor_id,
  };
}

function block(
  input: RuntimeExecutionReceiptInput,
  action: Exclude<RuntimeExecutionReceiptAction, "accept_execution_receipt">,
  blockers: string[],
  nextRoute: string,
): RuntimeExecutionReceiptVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: [],
    blockers,
    next_route: nextRoute,
  };
}

function requiredSteps(queue: RuntimeExecutionQueueVerdict): RuntimeExecutionStep[] {
  return queue.steps.filter((step) => step.required_before_release);
}

function missingRequiredSteps(input: RuntimeExecutionReceiptInput): string[] {
  const completed = new Set(input.completed_step_ids);
  return requiredSteps(input.queue)
    .filter((step) => !completed.has(step.step_id))
    .map((step) => `required execution step not completed: ${step.step_id}`);
}

function failedKnownSteps(input: RuntimeExecutionReceiptInput): string[] {
  const known = new Set(input.queue.steps.map((step) => step.step_id));
  return input.failed_step_ids.map((stepId) =>
    known.has(stepId) ? `execution step failed: ${stepId}` : `unknown execution step reported failed: ${stepId}`,
  );
}

function receiptEvidence(input: RuntimeExecutionReceiptInput): string[] {
  return [
    `executor ${input.executor_id}`,
    `before ${input.observed_before_head_sha}`,
    `after ${input.observed_after_head_sha}`,
    ...input.completed_step_ids.map((stepId) => `completed ${stepId}`),
    ...input.receipt_artifacts,
  ];
}

export function compileRuntimeExecutionReceipt(input: RuntimeExecutionReceiptInput): RuntimeExecutionReceiptVerdict {
  if (!input.queue.ok) {
    return block(
      input,
      "block_queue_not_executable",
      input.queue.blockers.length > 0 ? input.queue.blockers : ["runtime execution queue was not executable"],
      "repair the runtime execution queue before compiling an execution receipt",
    );
  }

  if (input.executor_id !== input.queue.executor_id) {
    return block(
      input,
      "block_receipt_mismatch",
      [`receipt executor ${input.executor_id} does not match queue executor ${input.queue.executor_id}`],
      "bind the receipt to the executor that compiled the queue",
    );
  }

  if (input.observed_before_head_sha !== input.queue.head_sha) {
    return block(
      input,
      "block_receipt_mismatch",
      [`receipt before-head ${input.observed_before_head_sha} does not match queued head ${input.queue.head_sha}`],
      "discard receipts that are not bound to the queued live head",
    );
  }

  const failed = failedKnownSteps(input);
  if (failed.length > 0) {
    return block(
      input,
      "block_failed_step",
      failed,
      "repair the failed execution step before accepting a runtime receipt",
    );
  }

  const missing = missingRequiredSteps(input);
  if (missing.length > 0) {
    return block(
      input,
      "block_missing_required_steps",
      missing,
      "complete every required execution step before release",
    );
  }

  if (input.receipt_artifacts.length === 0) {
    return block(
      input,
      "block_receipt_mismatch",
      ["execution receipt has no durable receipt artifact"],
      "record at least one durable receipt artifact before accepting execution",
    );
  }

  if (
    input.queue.action === "enqueue_external_embodiment" &&
    input.observed_after_head_sha === input.observed_before_head_sha
  ) {
    return block(
      input,
      "block_unmoved_embodiment_head",
      [`external embodiment execution did not move head ${input.observed_before_head_sha}`],
      "treat unmoved-head embodiment execution as incomplete and do not claim branch progress",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "accept_execution_receipt",
    decisive_evidence: receiptEvidence(input),
    blockers: [],
    next_route:
      input.queue.action === "enqueue_external_embodiment"
        ? "read only the moved-head status surface before another embodiment or status claim"
        : "continue from the accepted runtime receipt without replaying the completed publication class",
  };
}
