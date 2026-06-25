export type PostResolutionWorkloadClass =
  | "external_platform_embodiment"
  | "proof_evaluation"
  | "corpus_memory"
  | "manifestation_engine"
  | "exact_external_blocker"
  | "repaired_head_status_echo"
  | "metadata_reread"
  | "duplicate_ci_summary"
  | "duplicate_comment"
  | "duplicate_label"
  | "local_memory_guard"
  | "guessed_future_ci"
  | "reclose_resolved_blocker"
  | "warning_maintenance";

export type PostResolutionWorkloadAction =
  | "admit_post_resolution_processor_workload"
  | "emit_post_resolution_exact_blocker"
  | "block_no_admissible_workload";

export interface PostResolutionProcessorWorkloadCandidate {
  workload_id: string;
  workload_class: PostResolutionWorkloadClass;
  branch: string;
  base_head_sha: string;
  changed_files: string[];
  processor_loads: string[];
  required_outputs: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  exact_blocker?: string;
}

export interface PostResolutionProcessorWorkloadGateInput {
  active_branch: string;
  live_head_sha: string;
  repaired_head_sha: string;
  resolved_boundary_ids: string[];
  spent_workload_ids: string[];
  prohibited_workload_classes: PostResolutionWorkloadClass[];
  candidates: PostResolutionProcessorWorkloadCandidate[];
}

export interface RejectedPostResolutionProcessorWorkload {
  workload_id: string;
  reasons: string[];
}

export interface AdmittedPostResolutionProcessorWorkload {
  workload_id: string;
  workload_class: Extract<
    PostResolutionWorkloadClass,
    "external_platform_embodiment" | "proof_evaluation" | "corpus_memory" | "manifestation_engine" | "exact_external_blocker"
  >;
  branch: string;
  base_head_sha: string;
  processor_loads: string[];
  required_outputs: string[];
  decisive_evidence: string[];
}

export interface PostResolutionProcessorWorkloadGateVerdict {
  ok: boolean;
  action: PostResolutionWorkloadAction;
  admitted: AdmittedPostResolutionProcessorWorkload | null;
  rejected: RejectedPostResolutionProcessorWorkload[];
  quarantined_head_shas: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_CLASSES = new Set<PostResolutionWorkloadClass>([
  "repaired_head_status_echo",
  "metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "guessed_future_ci",
  "reclose_resolved_blocker",
  "warning_maintenance",
]);

const WORKLOAD_PRIORITY: PostResolutionWorkloadClass[] = [
  "external_platform_embodiment",
  "proof_evaluation",
  "corpus_memory",
  "manifestation_engine",
  "exact_external_blocker",
];

function clean(value: string): string {
  return value.trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(?:ts|js|mjs|json)$/.test(path);
}

function proofOnlyPath(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function priority(workloadClass: PostResolutionWorkloadClass): number {
  const index = WORKLOAD_PRIORITY.indexOf(workloadClass);
  return index === -1 ? WORKLOAD_PRIORITY.length : index;
}

function quarantinedHeads(input: PostResolutionProcessorWorkloadGateInput): string[] {
  return unique([
    input.repaired_head_sha === input.live_head_sha ? "" : input.repaired_head_sha,
    ...input.candidates.map((candidate) => (candidate.base_head_sha === input.live_head_sha ? "" : candidate.base_head_sha)),
  ]);
}

function decisiveEvidence(candidate: PostResolutionProcessorWorkloadCandidate): string[] {
  return unique([
    candidate.workload_id,
    candidate.workload_class,
    ...candidate.changed_files,
    ...candidate.processor_loads,
    ...candidate.required_outputs,
    ...candidate.executable_artifacts,
    ...candidate.routing_artifacts,
    ...candidate.proof_artifacts,
    candidate.exact_blocker ?? "",
  ]);
}

function candidateRejections(
  input: PostResolutionProcessorWorkloadGateInput,
  candidate: PostResolutionProcessorWorkloadCandidate,
): string[] {
  const reasons: string[] = [];
  const executableChanges = candidate.changed_files.filter(executablePlatformPath);
  const behaviorChanges = executableChanges.filter((path) => !proofOnlyPath(path));

  if (!clean(candidate.workload_id)) reasons.push("candidate has no workload id");
  if (input.spent_workload_ids.includes(candidate.workload_id)) reasons.push(`workload already spent: ${candidate.workload_id}`);
  if (candidate.branch !== input.active_branch) reasons.push(`candidate branch ${candidate.branch} is not ${input.active_branch}`);
  if (candidate.base_head_sha !== input.live_head_sha) reasons.push(`candidate base ${candidate.base_head_sha} is not live head ${input.live_head_sha}`);
  if (input.resolved_boundary_ids.length === 0) reasons.push("post-resolution workload gate has no resolved boundary id");
  if (input.prohibited_workload_classes.includes(candidate.workload_class)) {
    reasons.push(`candidate repeats prohibited workload class: ${candidate.workload_class}`);
  }
  if (NON_PROGRESS_CLASSES.has(candidate.workload_class)) {
    reasons.push(`candidate is non-progress after repaired-head resolution: ${candidate.workload_class}`);
  }

  if (candidate.workload_class === "exact_external_blocker") {
    if (!clean(candidate.exact_blocker ?? "")) reasons.push("exact external blocker workload has no blocker text");
    return reasons;
  }

  if (!WORKLOAD_PRIORITY.includes(candidate.workload_class)) {
    reasons.push(`candidate workload class is not selectable: ${candidate.workload_class}`);
  }
  if (executableChanges.length === 0) reasons.push("candidate changes no executable platform file");
  if (behaviorChanges.length === 0) reasons.push("candidate is proof-only and has no behavior file");
  if (candidate.processor_loads.length === 0) reasons.push("candidate has no processor load");
  if (candidate.required_outputs.length === 0) reasons.push("candidate has no required processor output");
  if (candidate.executable_artifacts.length === 0) reasons.push("candidate has no executable artifact evidence");
  if (candidate.routing_artifacts.length === 0) reasons.push("candidate has no routing artifact evidence");
  if (candidate.proof_artifacts.length === 0) reasons.push("candidate has no proof artifact evidence");

  return reasons;
}

export function admitPostResolutionProcessorWorkload(
  input: PostResolutionProcessorWorkloadGateInput,
): PostResolutionProcessorWorkloadGateVerdict {
  const rejected: RejectedPostResolutionProcessorWorkload[] = [];
  const admitted: AdmittedPostResolutionProcessorWorkload[] = [];

  for (const candidate of input.candidates) {
    const reasons = candidateRejections(input, candidate);
    if (reasons.length > 0) {
      rejected.push({ workload_id: candidate.workload_id || "<missing>", reasons });
      continue;
    }

    admitted.push({
      workload_id: candidate.workload_id,
      workload_class: candidate.workload_class as AdmittedPostResolutionProcessorWorkload["workload_class"],
      branch: candidate.branch,
      base_head_sha: candidate.base_head_sha,
      processor_loads: unique(candidate.processor_loads),
      required_outputs: unique(candidate.required_outputs),
      decisive_evidence: decisiveEvidence(candidate),
    });
  }

  admitted.sort((left, right) => priority(left.workload_class) - priority(right.workload_class));
  const selected = admitted[0] ?? null;

  if (!selected) {
    return {
      ok: false,
      action: "block_no_admissible_workload",
      admitted: null,
      rejected,
      quarantined_head_shas: quarantinedHeads(input),
      blockers: ["no post-resolution processor workload survived executable behavior admission"],
      next_route: "supply a live-head executable processor workload or one exact external blocker",
    };
  }

  const blockerMode = selected.workload_class === "exact_external_blocker";
  return {
    ok: true,
    action: blockerMode ? "emit_post_resolution_exact_blocker" : "admit_post_resolution_processor_workload",
    admitted: selected,
    rejected,
    quarantined_head_shas: quarantinedHeads(input),
    blockers: blockerMode ? selected.decisive_evidence : [],
    next_route: blockerMode
      ? "release the exact external blocker before any further post-resolution workload"
      : "dispatch the admitted processor workload, then require moved-head status after the external write",
  };
}
