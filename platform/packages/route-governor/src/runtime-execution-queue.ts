import type { FinalizationRuntimeDispatchVerdict } from "./finalization-runtime-dispatch.js";

export type RuntimeExecutionQueueAction =
  | "enqueue_external_embodiment"
  | "enqueue_status_publication"
  | "enqueue_blocker_publication"
  | "block_queue";

export type RuntimeExecutionStepKind =
  | "verify_live_head"
  | "write_branch"
  | "publish_status"
  | "publish_blocker"
  | "record_receipt"
  | "read_moved_head_status";

export interface RuntimeExecutionStep {
  step_id: string;
  kind: RuntimeExecutionStepKind;
  command: string;
  required_before_release: boolean;
  rollback_on_failure: boolean;
}

export interface RuntimeExecutionQueueInput {
  dispatch: FinalizationRuntimeDispatchVerdict;
  executor_id: string;
  receipt_sink: string;
  spent_executor_classes: string[];
}

export interface RuntimeExecutionQueueVerdict {
  ok: boolean;
  action: RuntimeExecutionQueueAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  executor_id: string;
  steps: RuntimeExecutionStep[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function base(input: RuntimeExecutionQueueInput): Pick<
  RuntimeExecutionQueueVerdict,
  "repository_full_name" | "pr_number" | "branch" | "head_sha" | "executor_id"
> {
  return {
    repository_full_name: input.dispatch.repository_full_name,
    pr_number: input.dispatch.pr_number,
    branch: input.dispatch.branch,
    head_sha: input.dispatch.head_sha,
    executor_id: input.executor_id,
  };
}

function block(input: RuntimeExecutionQueueInput, blockers: string[], nextRoute: string): RuntimeExecutionQueueVerdict {
  return {
    ...base(input),
    ok: false,
    action: "block_queue",
    steps: [],
    decisive_evidence: [],
    blockers,
    next_route: nextRoute,
  };
}

function step(
  step_id: string,
  kind: RuntimeExecutionStepKind,
  command: string,
  options: Pick<RuntimeExecutionStep, "required_before_release" | "rollback_on_failure">,
): RuntimeExecutionStep {
  return { step_id, kind, command, ...options };
}

function receiptStep(input: RuntimeExecutionQueueInput, releaseClass: string): RuntimeExecutionStep {
  return step(
    "record-execution-receipt",
    "record_receipt",
    `record ${releaseClass} receipt in ${input.receipt_sink}`,
    { required_before_release: true, rollback_on_failure: false },
  );
}

export function compileRuntimeExecutionQueue(input: RuntimeExecutionQueueInput): RuntimeExecutionQueueVerdict {
  if (!input.executor_id.trim()) {
    return block(input, ["runtime execution queue has no executor id"], "bind the queue to a concrete executor before release");
  }

  if (input.spent_executor_classes.includes(input.executor_id)) {
    return block(
      input,
      [`runtime executor class already spent: ${input.executor_id}`],
      "choose a new runtime executor class before moving the PR head again",
    );
  }

  if (!input.receipt_sink.trim()) {
    return block(input, ["runtime execution queue has no receipt sink"], "name the receipt sink before execution");
  }

  if (!input.dispatch.ok) {
    return block(
      input,
      input.dispatch.blockers.length > 0 ? input.dispatch.blockers : ["runtime dispatch is not executable"],
      "repair dispatch before compiling executor steps",
    );
  }

  const verify = step(
    "verify-live-head",
    "verify_live_head",
    `verify ${input.dispatch.branch}@${input.dispatch.head_sha} before executing ${input.executor_id}`,
    { required_before_release: true, rollback_on_failure: false },
  );

  if (input.dispatch.effect === "execute_external_embodiment_commit") {
    const writeCommand = input.dispatch.command_plan.find((command) => command.startsWith("write "));
    if (!writeCommand) {
      return block(
        input,
        ["external embodiment dispatch has no branch write command"],
        "compile a dispatch verdict with an explicit branch write command before queueing execution",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "enqueue_external_embodiment",
      steps: [
        verify,
        step("write-external-embodiment", "write_branch", writeCommand, {
          required_before_release: true,
          rollback_on_failure: true,
        }),
        receiptStep(input, "external embodiment"),
        step("read-moved-head-status", "read_moved_head_status", "read only the moved-head status surface after branch update", {
          required_before_release: false,
          rollback_on_failure: false,
        }),
      ],
      decisive_evidence: [input.executor_id, input.receipt_sink, ...input.dispatch.decisive_evidence],
      blockers: [],
      next_route: "execute queued branch write, record receipt, then read the moved-head status surface",
    };
  }

  if (input.dispatch.effect === "publish_live_head_status_readback") {
    return {
      ...base(input),
      ok: true,
      action: "enqueue_status_publication",
      steps: [
        verify,
        step("publish-live-head-status", "publish_status", `publish status readback for ${input.dispatch.head_sha}`, {
          required_before_release: true,
          rollback_on_failure: false,
        }),
        receiptStep(input, "live-head status readback"),
      ],
      decisive_evidence: [input.executor_id, input.receipt_sink, ...input.dispatch.decisive_evidence],
      blockers: [],
      next_route: "publish the live-head status readback, then choose a non-repeated runtime embodiment class",
    };
  }

  if (input.dispatch.effect === "publish_exact_external_blocker") {
    return {
      ...base(input),
      ok: true,
      action: "enqueue_blocker_publication",
      steps: [
        verify,
        step("publish-exact-blocker", "publish_blocker", input.dispatch.blockers.join("; "), {
          required_before_release: true,
          rollback_on_failure: false,
        }),
        receiptStep(input, "exact external blocker"),
      ],
      decisive_evidence: [input.executor_id, input.receipt_sink, ...input.dispatch.decisive_evidence],
      blockers: input.dispatch.blockers,
      next_route: "publish the exact blocker and do not advance until it is removed",
    };
  }

  return block(input, [`dispatch effect is not queueable: ${input.dispatch.effect}`], "return to runtime dispatch before queueing");
}
