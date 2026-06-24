import type { RuntimeExecutionQueueVerdict, RuntimeExecutionStepKind } from "./runtime-execution-queue.js";

export type RuntimeExecutionObservationStatus = "completed" | "failed" | "skipped";
export type RuntimeExecutionObservedStatusClaim = "none" | "passing" | "passing_with_warnings" | "pending" | "failing";

export type RuntimeExecutionObservationAction =
  | "accept_runtime_execution_observation"
  | "block_unaccepted_queue"
  | "block_branch_or_head_mismatch"
  | "block_unplanned_event"
  | "block_missing_required_step"
  | "block_failed_required_step"
  | "block_unmoved_write_head"
  | "block_status_claim_from_write";

export interface RuntimeExecutionObservedEvent {
  step_id: string;
  kind: RuntimeExecutionStepKind;
  command: string;
  status: RuntimeExecutionObservationStatus;
  produced_head_sha?: string;
  evidence: string[];
}

export interface RuntimeExecutionObservationInput {
  queue: RuntimeExecutionQueueVerdict;
  active_branch: string;
  pre_execution_head_sha: string;
  post_execution_head_sha?: string;
  observed_events: RuntimeExecutionObservedEvent[];
  status_claim: RuntimeExecutionObservedStatusClaim;
}

export interface RuntimeExecutionObservationVerdict {
  ok: boolean;
  action: RuntimeExecutionObservationAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  previous_head_sha: string;
  head_sha: string;
  completed_step_ids: string[];
  required_status_head_sha: string | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function base(input: RuntimeExecutionObservationInput): Pick<
  RuntimeExecutionObservationVerdict,
  "repository_full_name" | "pr_number" | "branch" | "previous_head_sha" | "head_sha"
> {
  return {
    repository_full_name: input.queue.repository_full_name,
    pr_number: input.queue.pr_number,
    branch: input.queue.branch,
    previous_head_sha: input.pre_execution_head_sha,
    head_sha: input.post_execution_head_sha ?? input.pre_execution_head_sha,
  };
}

function block(
  input: RuntimeExecutionObservationInput,
  action: Exclude<RuntimeExecutionObservationAction, "accept_runtime_execution_observation">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): RuntimeExecutionObservationVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    completed_step_ids: completedStepIds(input),
    required_status_head_sha: null,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function plannedStepIds(input: RuntimeExecutionObservationInput): Set<string> {
  return new Set(input.queue.steps.map((step) => step.step_id));
}

function completedStepIds(input: RuntimeExecutionObservationInput): string[] {
  return input.observed_events.filter((event) => event.status === "completed").map((event) => event.step_id);
}

function completedEvents(input: RuntimeExecutionObservationInput): RuntimeExecutionObservedEvent[] {
  const completed = new Set<string>();
  return input.observed_events.filter((event) => {
    if (event.status !== "completed" || completed.has(event.step_id)) return false;
    completed.add(event.step_id);
    return true;
  });
}

function missingRequiredSteps(input: RuntimeExecutionObservationInput): string[] {
  const completed = new Set(completedStepIds(input));
  return input.queue.steps
    .filter((step) => step.required_before_release && !completed.has(step.step_id))
    .map((step) => step.step_id);
}

function failedRequiredSteps(input: RuntimeExecutionObservationInput): string[] {
  const required = new Set(input.queue.steps.filter((step) => step.required_before_release).map((step) => step.step_id));
  return input.observed_events
    .filter((event) => required.has(event.step_id) && event.status === "failed")
    .map((event) => event.step_id);
}

function eventEvidence(events: RuntimeExecutionObservedEvent[]): string[] {
  return events.flatMap((event) => [
    `${event.step_id}:${event.kind}:${event.status}`,
    ...(event.produced_head_sha ? [`produced head ${event.produced_head_sha}`] : []),
    ...event.evidence,
  ]);
}

function hasWriteStep(input: RuntimeExecutionObservationInput): boolean {
  return input.queue.steps.some((step) => step.kind === "write_branch");
}

export function observeRuntimeExecution(
  input: RuntimeExecutionObservationInput,
): RuntimeExecutionObservationVerdict {
  if (!input.queue.ok) {
    return block(
      input,
      "block_unaccepted_queue",
      input.queue.blockers.length > 0 ? input.queue.blockers : [`runtime queue is not accepted: ${input.queue.action}`],
      "accept a runtime execution queue before observing execution results",
    );
  }

  if (input.queue.branch !== input.active_branch || input.queue.head_sha !== input.pre_execution_head_sha) {
    return block(
      input,
      "block_branch_or_head_mismatch",
      [
        ...(input.queue.branch !== input.active_branch
          ? [`queue branch ${input.queue.branch} does not match active branch ${input.active_branch}`]
          : []),
        ...(input.queue.head_sha !== input.pre_execution_head_sha
          ? [`queue head ${input.queue.head_sha} does not match pre-execution head ${input.pre_execution_head_sha}`]
          : []),
      ],
      "rebuild the execution observation from the live branch and pre-execution head",
    );
  }

  const planned = plannedStepIds(input);
  const unplanned = input.observed_events.filter((event) => !planned.has(event.step_id));
  if (unplanned.length > 0) {
    return block(
      input,
      "block_unplanned_event",
      unplanned.map((event) => `unplanned execution event: ${event.step_id}`),
      "drop unplanned observations or rebuild the queue before accepting execution",
    );
  }

  const failedRequired = failedRequiredSteps(input);
  if (failedRequired.length > 0) {
    return block(
      input,
      "block_failed_required_step",
      failedRequired.map((stepId) => `required execution step failed: ${stepId}`),
      "repair the failed required execution step before accepting the branch movement",
      eventEvidence(input.observed_events.filter((event) => failedRequired.includes(event.step_id))),
    );
  }

  const missingRequired = missingRequiredSteps(input);
  if (missingRequired.length > 0) {
    return block(
      input,
      "block_missing_required_step",
      missingRequired.map((stepId) => `required execution step missing: ${stepId}`),
      "complete every required execution step before recording a release receipt",
      eventEvidence(completedEvents(input)),
    );
  }

  const writeStepPresent = hasWriteStep(input);
  const finalHead = input.post_execution_head_sha ?? input.pre_execution_head_sha;
  if (writeStepPresent && finalHead === input.pre_execution_head_sha) {
    return block(
      input,
      "block_unmoved_write_head",
      [`write execution did not move branch head from ${input.pre_execution_head_sha}`],
      "do not accept the execution receipt until the external branch head changes",
      eventEvidence(completedEvents(input)),
    );
  }

  if (writeStepPresent && input.status_claim !== "none") {
    return block(
      input,
      "block_status_claim_from_write",
      [`branch write attempted to carry status claim: ${input.status_claim}`],
      "record the branch write separately, then read status only for the moved head",
      eventEvidence(completedEvents(input)),
    );
  }

  const requiredStatusHead = writeStepPresent ? finalHead : null;

  return {
    ...base(input),
    ok: true,
    action: "accept_runtime_execution_observation",
    completed_step_ids: completedStepIds(input),
    required_status_head_sha: requiredStatusHead,
    decisive_evidence: [
      input.queue.executor_id,
      input.queue.action,
      ...(writeStepPresent ? [`head moved from ${input.pre_execution_head_sha} to ${finalHead}`] : []),
      ...eventEvidence(completedEvents(input)),
    ],
    blockers: [],
    next_route: requiredStatusHead
      ? `read status only for moved execution head ${requiredStatusHead}`
      : "publish the accepted non-write execution observation through the queued release surface",
  };
}
