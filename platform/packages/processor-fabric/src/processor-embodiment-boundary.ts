export type ProcessorEmbodimentProgressClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "metadata_reread"
  | "duplicate_ci_summary"
  | "duplicate_comment"
  | "duplicate_label"
  | "local_memory_guard"
  | "guessed_future_ci"
  | "reclose_resolved_blocker"
  | "route_governor_only";

export type ProcessorEmbodimentBoundaryAction =
  | "admit_processor_embodiment_boundary"
  | "emit_processor_boundary_blocker"
  | "block_missing_boundary_id"
  | "block_reused_boundary"
  | "block_wrong_branch"
  | "block_wrong_head"
  | "block_unresolved_status_boundary"
  | "block_non_progress_class"
  | "block_route_governor_only"
  | "block_missing_processor_dispatch"
  | "block_missing_convergence"
  | "block_incomplete_boundary";

export interface ProcessorEmbodimentCandidate {
  boundary_id: string;
  progress_class: ProcessorEmbodimentProgressClass;
  branch: string;
  base_head_sha: string;
  changed_files: string[];
  behavior_exports: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  processor_dispatch_ids: string[];
  convergence_receipts: string[];
  resolved_boundary_ids: string[];
  blocker?: string;
}

export interface ProcessorEmbodimentBoundaryInput {
  active_branch: string;
  live_head_sha: string;
  repaired_head_sha: string;
  spent_boundary_ids: string[];
  spent_progress_classes: ProcessorEmbodimentProgressClass[];
  candidate: ProcessorEmbodimentCandidate;
}

export interface ProcessorEmbodimentBoundaryVerdict {
  ok: boolean;
  action: ProcessorEmbodimentBoundaryAction;
  boundary_id: string | null;
  branch: string;
  head_sha: string;
  quarantined_head_shas: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_CLASSES = new Set<ProcessorEmbodimentProgressClass>([
  "fresh_status_readback",
  "metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "guessed_future_ci",
  "reclose_resolved_blocker",
]);

function normalized(value: string): string {
  return value.trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(normalized).filter(Boolean))];
}

function executableProcessorPath(path: string): boolean {
  return path.startsWith("platform/packages/processor-fabric/") && /\.(ts|js|mjs|json)$/.test(path);
}

function behaviorProcessorPath(path: string): boolean {
  return executableProcessorPath(path) && !/(?:\.test|-proof)\.ts$/.test(path) && !path.endsWith("package.json");
}

function base(input: ProcessorEmbodimentBoundaryInput): Pick<
  ProcessorEmbodimentBoundaryVerdict,
  "boundary_id" | "branch" | "head_sha" | "quarantined_head_shas"
> {
  const candidate = input.candidate;
  const quarantined = unique([
    input.repaired_head_sha !== input.live_head_sha ? input.repaired_head_sha : "",
    candidate.base_head_sha !== input.live_head_sha ? candidate.base_head_sha : "",
  ]);

  return {
    boundary_id: normalized(candidate.boundary_id) || null,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    quarantined_head_shas: quarantined,
  };
}

function block(
  input: ProcessorEmbodimentBoundaryInput,
  action: Exclude<
    ProcessorEmbodimentBoundaryAction,
    "admit_processor_embodiment_boundary" | "emit_processor_boundary_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ProcessorEmbodimentBoundaryVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: unique(evidence),
    blockers: unique(blockers),
    next_route: nextRoute,
  };
}

function embodimentBlockers(candidate: ProcessorEmbodimentCandidate): string[] {
  const blockers: string[] = [];

  if (!candidate.changed_files.some(executableProcessorPath)) {
    blockers.push("processor embodiment changes no executable processor-fabric file");
  }
  if (!candidate.changed_files.some(behaviorProcessorPath)) {
    blockers.push("processor embodiment has no behavior-bearing processor-fabric file");
  }
  if (candidate.behavior_exports.length === 0) blockers.push("processor embodiment exposes no behavior export");
  if (candidate.routing_artifacts.length === 0) blockers.push("processor embodiment has no routing artifact");
  if (candidate.proof_artifacts.length === 0) blockers.push("processor embodiment has no proof artifact");
  if (candidate.processor_dispatch_ids.length === 0) blockers.push("processor embodiment has no processor dispatch receipt");
  if (candidate.convergence_receipts.length === 0) blockers.push("processor embodiment has no convergence receipt");

  return blockers;
}

export function admitProcessorEmbodimentBoundary(
  input: ProcessorEmbodimentBoundaryInput,
): ProcessorEmbodimentBoundaryVerdict {
  const candidate = input.candidate;
  const boundaryId = normalized(candidate.boundary_id);
  const evidence = unique([
    boundaryId,
    `live head ${input.live_head_sha}`,
    `repaired head ${input.repaired_head_sha}`,
    ...candidate.changed_files,
    ...candidate.processor_dispatch_ids,
    ...candidate.convergence_receipts,
    ...candidate.resolved_boundary_ids,
  ]);

  if (!boundaryId) {
    return block(input, "block_missing_boundary_id", ["processor embodiment boundary has no id"], "mint a boundary id before processor-fabric embodiment", evidence);
  }

  if (input.spent_boundary_ids.includes(boundaryId)) {
    return block(input, "block_reused_boundary", [`processor embodiment boundary already spent: ${boundaryId}`], "create a fresh processor boundary for the live head", evidence);
  }

  if (candidate.branch !== input.active_branch) {
    return block(input, "block_wrong_branch", [`candidate branch ${candidate.branch} is not ${input.active_branch}`], "bind processor embodiment to the active PR branch", evidence);
  }

  if (candidate.base_head_sha !== input.live_head_sha) {
    return block(input, "block_wrong_head", [`candidate base ${candidate.base_head_sha} is not live head ${input.live_head_sha}`], "rebase processor embodiment to the live PR head", evidence);
  }

  if (candidate.resolved_boundary_ids.length === 0) {
    return block(input, "block_unresolved_status_boundary", ["processor embodiment has no resolved repaired-head boundary id"], "resolve the repaired-head boundary before consuming post-resolution processor work", evidence);
  }

  if (input.spent_progress_classes.includes(candidate.progress_class) || NON_PROGRESS_CLASSES.has(candidate.progress_class)) {
    return block(input, "block_non_progress_class", [`processor embodiment repeats non-progress class: ${candidate.progress_class}`], "choose a new processor-fabric embodiment or one exact external blocker", evidence);
  }

  if (candidate.progress_class === "route_governor_only") {
    return block(input, "block_route_governor_only", ["post-resolution processor boundary cannot be satisfied by another route-governor-only wrapper"], "move executable behavior into processor-fabric or emit the exact blocker", evidence);
  }

  if (candidate.progress_class === "exact_external_blocker") {
    const blocker = normalized(candidate.blocker ?? "");
    if (!blocker) {
      return block(input, "block_incomplete_boundary", ["exact processor boundary blocker has no blocker text"], "name the external blocker or provide processor embodiment evidence", evidence);
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_processor_boundary_blocker",
      decisive_evidence: unique([...evidence, blocker]),
      blockers: [blocker],
      next_route: "remove the exact processor boundary blocker before selecting another embodiment",
    };
  }

  if (candidate.progress_class !== "external_platform_embodiment") {
    return block(input, "block_non_progress_class", [`processor boundary cannot admit ${candidate.progress_class}`], "supply external processor-fabric embodiment evidence", evidence);
  }

  if (candidate.processor_dispatch_ids.length === 0) {
    return block(input, "block_missing_processor_dispatch", ["processor embodiment lacks dispatched processor ids"], "run or record bounded processor dispatch before embodiment admission", evidence);
  }

  if (candidate.convergence_receipts.length === 0) {
    return block(input, "block_missing_convergence", ["processor embodiment lacks convergence receipts"], "settle processor outputs before embodiment admission", evidence);
  }

  const incomplete = embodimentBlockers(candidate);
  if (incomplete.length > 0) {
    return block(input, "block_incomplete_boundary", incomplete, "supply behavior, routing, proof, dispatch, and convergence evidence before admission", evidence);
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_processor_embodiment_boundary",
    decisive_evidence: unique([
      ...evidence,
      ...candidate.behavior_exports,
      ...candidate.routing_artifacts,
      ...candidate.proof_artifacts,
    ]),
    blockers: [],
    next_route: "write the processor-fabric embodiment, then require fresh status authority for the moved head",
  };
}
