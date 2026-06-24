import type { SourceAuthorizedConvergenceVerdict } from "./source-authorized-convergence.js";

export type ProcessorContinuationHandoffTarget =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "metadata_reread"
  | "duplicate_comment"
  | "local_memory_guard"
  | "warning_maintenance";

export type ProcessorContinuationHandoffAction =
  | "handoff_processor_external_act"
  | "handoff_processor_exact_blocker"
  | "require_processor_blocker_release"
  | "block_missing_handoff_id"
  | "block_reused_handoff"
  | "block_non_progress_target"
  | "block_wrong_branch"
  | "block_wrong_head"
  | "block_missing_target_receipt"
  | "block_incomplete_external_act";

export interface ProcessorContinuationTargetReceipt {
  target_id: string;
  target: ProcessorContinuationHandoffTarget;
  branch: string;
  base_head_sha: string;
  changed_files: string[];
  behavior_exports: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  blocker?: string;
}

export interface ProcessorContinuationHandoffInput {
  active_branch: string;
  live_head_sha: string;
  handoff_id: string;
  spent_handoff_ids: string[];
  convergence: SourceAuthorizedConvergenceVerdict;
  target_receipt?: ProcessorContinuationTargetReceipt;
}

export interface ProcessorContinuationHandoffVerdict {
  ok: boolean;
  action: ProcessorContinuationHandoffAction;
  handoff_id: string | null;
  branch: string;
  head_sha: string;
  accepted_output: string | null;
  target_id: string | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_TARGETS = new Set<ProcessorContinuationHandoffTarget>([
  "metadata_reread",
  "duplicate_comment",
  "local_memory_guard",
  "warning_maintenance",
]);

function normalized(value: string): string {
  return value.trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(normalized).filter(Boolean))];
}

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function behaviorPath(path: string): boolean {
  return executablePlatformPath(path) && !/(?:\.test|-proof)\.ts$/.test(path);
}

function base(input: ProcessorContinuationHandoffInput): Pick<
  ProcessorContinuationHandoffVerdict,
  "handoff_id" | "branch" | "head_sha" | "accepted_output" | "target_id"
> {
  const handoffId = normalized(input.handoff_id);
  return {
    handoff_id: handoffId || null,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    accepted_output: input.convergence.accepted_output,
    target_id: input.target_receipt?.target_id ?? null,
  };
}

function convergenceEvidence(input: ProcessorContinuationHandoffInput): string[] {
  return unique([
    `handoff ${input.handoff_id || "<missing>"}`,
    `convergence ${input.convergence.scene_id ?? "<missing>"}`,
    `convergence action ${input.convergence.action}`,
    `live head ${input.live_head_sha}`,
    ...(input.convergence.accepted_output ? [`accepted ${input.convergence.accepted_output}`] : []),
    ...input.convergence.authorized_outputs,
    ...input.convergence.decisive_evidence,
  ]);
}

function block(
  input: ProcessorContinuationHandoffInput,
  action: Exclude<
    ProcessorContinuationHandoffAction,
    "handoff_processor_external_act" | "handoff_processor_exact_blocker" | "require_processor_blocker_release"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ProcessorContinuationHandoffVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: unique(evidence),
    blockers: unique(blockers),
    next_route: nextRoute,
  };
}

function externalActBlockers(receipt: ProcessorContinuationTargetReceipt): string[] {
  const blockers: string[] = [];
  if (!receipt.changed_files.some(executablePlatformPath)) blockers.push("processor handoff target changes no executable platform file");
  if (!receipt.changed_files.some(behaviorPath)) blockers.push("processor handoff target has no behavior-bearing file");
  if (receipt.behavior_exports.length === 0) blockers.push("processor handoff target exposes no behavior export");
  if (receipt.routing_artifacts.length === 0) blockers.push("processor handoff target has no routing artifact");
  if (receipt.proof_artifacts.length === 0) blockers.push("processor handoff target has no proof artifact");
  return blockers;
}

export function routeProcessorContinuationHandoff(
  input: ProcessorContinuationHandoffInput,
): ProcessorContinuationHandoffVerdict {
  const handoffId = normalized(input.handoff_id);
  const evidence = convergenceEvidence(input);

  if (!handoffId) {
    return block(input, "block_missing_handoff_id", ["processor continuation handoff has no id"], "mint a handoff id before consuming processor convergence", evidence);
  }

  if (input.spent_handoff_ids.includes(handoffId)) {
    return block(input, "block_reused_handoff", [`processor continuation handoff already spent: ${handoffId}`], "create a fresh processor handoff for the current convergence result", evidence);
  }

  if (input.convergence.branch !== input.active_branch) {
    return block(input, "block_wrong_branch", [`processor convergence branch ${input.convergence.branch} is not ${input.active_branch}`], "rerun processor convergence on the active PR branch", evidence);
  }

  if (input.convergence.head_sha !== input.live_head_sha) {
    return block(input, "block_wrong_head", [`processor convergence head ${input.convergence.head_sha} is not live head ${input.live_head_sha}`], "rerun processor convergence on the live PR head", evidence);
  }

  if (!input.convergence.ok || input.convergence.action === "settle_source_authorized_exact_blocker") {
    const blockers = unique(input.convergence.blockers.length > 0 ? input.convergence.blockers : [input.convergence.accepted_output ?? "processor convergence did not settle an external act"]);
    return {
      ...base(input),
      ok: true,
      action: "require_processor_blocker_release",
      decisive_evidence: evidence,
      blockers,
      next_route: "release the processor-settled exact blocker before any embodiment write",
    };
  }

  if (input.convergence.action !== "settle_source_authorized_external_act" || !input.convergence.accepted_output) {
    return block(input, "block_missing_target_receipt", ["processor convergence has no external act to hand off"], "settle an external act or exact blocker before handoff", evidence);
  }

  const receipt = input.target_receipt;
  if (!receipt) {
    return block(input, "block_missing_target_receipt", ["processor external act has no target receipt"], "attach a branch-bound target receipt before writing", evidence);
  }

  if (!normalized(receipt.target_id)) {
    return block(input, "block_missing_target_receipt", ["processor target receipt has no id"], "mint a target receipt id before handoff", evidence);
  }

  if (receipt.branch !== input.active_branch) {
    return block(input, "block_wrong_branch", [`processor target branch ${receipt.branch} is not ${input.active_branch}`], "bind processor target receipt to the active PR branch", [...evidence, receipt.target_id]);
  }

  if (receipt.base_head_sha !== input.live_head_sha) {
    return block(input, "block_wrong_head", [`processor target base ${receipt.base_head_sha} is not live head ${input.live_head_sha}`], "rebase processor target receipt to the live PR head", [...evidence, receipt.target_id]);
  }

  if (NON_PROGRESS_TARGETS.has(receipt.target) || receipt.target === "fresh_status_readback") {
    return block(input, "block_non_progress_target", [`processor target cannot consume convergence as progress: ${receipt.target}`], "choose a branch embodiment target or exact processor blocker", [...evidence, receipt.target]);
  }

  if (receipt.target === "exact_external_blocker") {
    const blocker = normalized(receipt.blocker ?? "");
    if (!blocker) {
      return block(input, "block_missing_target_receipt", ["exact processor blocker target has no blocker text"], "name the exact blocker or provide an embodiment target", evidence);
    }

    return {
      ...base(input),
      ok: true,
      action: "handoff_processor_exact_blocker",
      accepted_output: blocker,
      decisive_evidence: unique([...evidence, receipt.target_id, blocker]),
      blockers: [blocker],
      next_route: "remove the processor target blocker before another handoff",
    };
  }

  const incomplete = externalActBlockers(receipt);
  if (incomplete.length > 0) {
    return block(input, "block_incomplete_external_act", incomplete, "supply behavior, routing, and proof surfaces before processor handoff", [...evidence, receipt.target_id, ...receipt.changed_files]);
  }

  return {
    ...base(input),
    ok: true,
    action: "handoff_processor_external_act",
    decisive_evidence: unique([
      ...evidence,
      receipt.target_id,
      input.convergence.accepted_output,
      ...receipt.changed_files.filter(executablePlatformPath),
      ...receipt.behavior_exports,
      ...receipt.routing_artifacts,
      ...receipt.proof_artifacts,
    ]),
    blockers: [],
    next_route: "write the processor-selected embodiment, then require moved-head status before downstream review or merge authority",
  };
}
