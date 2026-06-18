import type { RuntimeExecutionObservationVerdict } from "./runtime-execution-observer.js";
import type { RuntimeExecutionQueueVerdict } from "./runtime-execution-queue.js";
import type { RuntimeExecutionReceiptVerdict } from "./runtime-execution-receipt.js";

export type RuntimeExecutionEvidenceAction =
  | "accept_runtime_execution_evidence"
  | "block_queue_not_accepted"
  | "block_observation_not_accepted"
  | "block_receipt_not_accepted"
  | "block_evidence_mismatch"
  | "block_missing_moved_head_status_obligation";

export interface RuntimeExecutionEvidenceInput {
  queue: RuntimeExecutionQueueVerdict;
  observation: RuntimeExecutionObservationVerdict;
  receipt: RuntimeExecutionReceiptVerdict;
  require_moved_head_status_surface?: boolean;
  moved_head_status_surface_head_sha?: string;
}

export interface RuntimeExecutionEvidenceVerdict {
  ok: boolean;
  action: RuntimeExecutionEvidenceAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  before_head_sha: string;
  after_head_sha: string;
  executor_id: string;
  status_head_required_before_next_claim: string | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function base(input: RuntimeExecutionEvidenceInput): Pick<
  RuntimeExecutionEvidenceVerdict,
  "repository_full_name" | "pr_number" | "branch" | "before_head_sha" | "after_head_sha" | "executor_id"
> {
  return {
    repository_full_name: input.queue.repository_full_name,
    pr_number: input.queue.pr_number,
    branch: input.queue.branch,
    before_head_sha: input.queue.head_sha,
    after_head_sha: input.receipt.after_head_sha,
    executor_id: input.queue.executor_id,
  };
}

function block(
  input: RuntimeExecutionEvidenceInput,
  action: Exclude<RuntimeExecutionEvidenceAction, "accept_runtime_execution_evidence">,
  blockers: string[],
  nextRoute: string,
): RuntimeExecutionEvidenceVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    status_head_required_before_next_claim: null,
    decisive_evidence: [],
    blockers,
    next_route: nextRoute,
  };
}

function mismatchBlockers(input: RuntimeExecutionEvidenceInput): string[] {
  const blockers: string[] = [];

  if (input.observation.repository_full_name !== input.queue.repository_full_name) {
    blockers.push(
      `observation repository ${input.observation.repository_full_name} does not match queue repository ${input.queue.repository_full_name}`,
    );
  }

  if (input.receipt.repository_full_name !== input.queue.repository_full_name) {
    blockers.push(
      `receipt repository ${input.receipt.repository_full_name} does not match queue repository ${input.queue.repository_full_name}`,
    );
  }

  if (input.observation.pr_number !== input.queue.pr_number || input.receipt.pr_number !== input.queue.pr_number) {
    blockers.push("runtime execution evidence is not bound to one PR number");
  }

  if (input.observation.branch !== input.queue.branch || input.receipt.branch !== input.queue.branch) {
    blockers.push("runtime execution evidence is not bound to one branch");
  }

  if (input.observation.previous_head_sha !== input.queue.head_sha) {
    blockers.push(
      `observation previous head ${input.observation.previous_head_sha} does not match queued head ${input.queue.head_sha}`,
    );
  }

  if (input.receipt.before_head_sha !== input.queue.head_sha) {
    blockers.push(`receipt before head ${input.receipt.before_head_sha} does not match queued head ${input.queue.head_sha}`);
  }

  if (input.observation.head_sha !== input.receipt.after_head_sha) {
    blockers.push(
      `observation after head ${input.observation.head_sha} does not match receipt after head ${input.receipt.after_head_sha}`,
    );
  }

  if (input.receipt.executor_id !== input.queue.executor_id) {
    blockers.push(`receipt executor ${input.receipt.executor_id} does not match queue executor ${input.queue.executor_id}`);
  }

  return blockers;
}

function externalEmbodimentStatusHead(input: RuntimeExecutionEvidenceInput): string | null {
  return input.queue.action === "enqueue_external_embodiment" ? input.receipt.after_head_sha : null;
}

export function compileRuntimeExecutionEvidence(
  input: RuntimeExecutionEvidenceInput,
): RuntimeExecutionEvidenceVerdict {
  if (!input.queue.ok) {
    return block(
      input,
      "block_queue_not_accepted",
      input.queue.blockers.length > 0 ? input.queue.blockers : ["runtime execution queue was not accepted"],
      "accept an executable runtime queue before compiling execution evidence",
    );
  }

  if (!input.observation.ok) {
    return block(
      input,
      "block_observation_not_accepted",
      input.observation.blockers.length > 0
        ? input.observation.blockers
        : ["runtime execution observation was not accepted"],
      "observe the queued execution successfully before compiling execution evidence",
    );
  }

  if (!input.receipt.ok) {
    return block(
      input,
      "block_receipt_not_accepted",
      input.receipt.blockers.length > 0 ? input.receipt.blockers : ["runtime execution receipt was not accepted"],
      "record an accepted execution receipt before compiling execution evidence",
    );
  }

  const mismatches = mismatchBlockers(input);
  if (mismatches.length > 0) {
    return block(
      input,
      "block_evidence_mismatch",
      mismatches,
      "rebuild queue, observation, and receipt from the same PR branch, executor, and head transition",
    );
  }

  const requiredStatusHead = externalEmbodimentStatusHead(input);
  if (requiredStatusHead && input.observation.required_status_head_sha !== requiredStatusHead) {
    return block(
      input,
      "block_missing_moved_head_status_obligation",
      [`execution observation does not require status readback for moved head ${requiredStatusHead}`],
      "bind the execution observation to the moved-head status obligation before another claim",
    );
  }

  if (
    requiredStatusHead &&
    input.require_moved_head_status_surface &&
    input.moved_head_status_surface_head_sha !== requiredStatusHead
  ) {
    return block(
      input,
      "block_missing_moved_head_status_obligation",
      [`moved-head status surface missing for ${requiredStatusHead}`],
      "read the moved-head status surface before making a status or merge claim",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "accept_runtime_execution_evidence",
    status_head_required_before_next_claim: requiredStatusHead,
    decisive_evidence: [
      input.queue.executor_id,
      input.queue.action,
      `head transition ${input.queue.head_sha} -> ${input.receipt.after_head_sha}`,
      ...input.queue.decisive_evidence,
      ...input.observation.decisive_evidence,
      ...input.receipt.decisive_evidence,
    ],
    blockers: [],
    next_route: requiredStatusHead
      ? `read moved-head status for ${requiredStatusHead} before any status or merge claim`
      : "publish the accepted execution evidence without replaying queue, observation, or receipt as separate progress",
  };
}
