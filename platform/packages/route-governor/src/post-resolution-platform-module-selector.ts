export type PostResolutionPlatformModuleId =
  | "route_governor"
  | "processor_fabric"
  | "proof_evaluation"
  | "corpus_memory"
  | "manifestation_engine";

export type PostResolutionPlatformProgressClass =
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
  | "warning_maintenance";

export type PostResolutionPlatformAction =
  | "select_platform_module_embodiment"
  | "select_exact_external_blocker"
  | "block_no_selectable_platform_module";

export interface PostResolutionPlatformCandidate {
  candidate_id: string;
  module_id: PostResolutionPlatformModuleId;
  progress_class: PostResolutionPlatformProgressClass;
  branch: string;
  base_head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  produces_new_package_boundary: boolean;
  blocker?: string;
}

export interface PostResolutionPlatformModuleSelectorInput {
  active_branch: string;
  live_head_sha: string;
  repaired_head_sha: string;
  resolved_boundary_ids: string[];
  existing_package_boundaries: PostResolutionPlatformModuleId[];
  prohibited_progress_classes: PostResolutionPlatformProgressClass[];
  spent_candidate_ids: string[];
  candidates: PostResolutionPlatformCandidate[];
}

export interface RejectedPostResolutionPlatformCandidate {
  candidate_id: string;
  reasons: string[];
}

export interface SelectedPostResolutionPlatformCandidate {
  candidate_id: string;
  module_id: PostResolutionPlatformModuleId | null;
  progress_class: Extract<PostResolutionPlatformProgressClass, "external_platform_embodiment" | "exact_external_blocker">;
  decisive_evidence: string[];
}

export interface PostResolutionPlatformModuleSelectorVerdict {
  ok: boolean;
  action: PostResolutionPlatformAction;
  branch: string;
  head_sha: string;
  selected: SelectedPostResolutionPlatformCandidate | null;
  rejected: RejectedPostResolutionPlatformCandidate[];
  quarantined_head_shas: string[];
  blockers: string[];
  next_route: string;
}

const MODULE_PRIORITY: PostResolutionPlatformModuleId[] = [
  "processor_fabric",
  "proof_evaluation",
  "corpus_memory",
  "manifestation_engine",
  "route_governor",
];

const NON_PROGRESS_CLASSES = new Set<PostResolutionPlatformProgressClass>([
  "fresh_status_readback",
  "metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "guessed_future_ci",
  "reclose_resolved_blocker",
  "warning_maintenance",
]);

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function proofOnlyPath(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function modulePriority(moduleId: PostResolutionPlatformModuleId): number {
  const index = MODULE_PRIORITY.indexOf(moduleId);
  return index === -1 ? MODULE_PRIORITY.length : index;
}

function quarantinedHeads(input: PostResolutionPlatformModuleSelectorInput): string[] {
  const heads = new Set<string>();
  if (input.repaired_head_sha !== input.live_head_sha) heads.add(input.repaired_head_sha);
  for (const candidate of input.candidates) {
    if (candidate.base_head_sha !== input.live_head_sha) heads.add(candidate.base_head_sha);
  }
  return [...heads];
}

function candidateRejections(
  input: PostResolutionPlatformModuleSelectorInput,
  candidate: PostResolutionPlatformCandidate,
): string[] {
  const reasons: string[] = [];
  const executableChanges = candidate.changed_files.filter(executablePlatformPath);
  const behaviorChanges = executableChanges.filter((path) => !proofOnlyPath(path));

  if (!candidate.candidate_id.trim()) reasons.push("candidate has no id");
  if (input.spent_candidate_ids.includes(candidate.candidate_id)) reasons.push(`candidate already spent: ${candidate.candidate_id}`);
  if (candidate.branch !== input.active_branch) {
    reasons.push(`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`);
  }
  if (candidate.base_head_sha !== input.live_head_sha) {
    reasons.push(`candidate base ${candidate.base_head_sha} is not live head ${input.live_head_sha}`);
  }
  if (input.resolved_boundary_ids.length === 0) reasons.push("post-resolution selector has no resolved boundary id");
  if (input.prohibited_progress_classes.includes(candidate.progress_class)) {
    reasons.push(`candidate repeats prohibited progress class: ${candidate.progress_class}`);
  }
  if (NON_PROGRESS_CLASSES.has(candidate.progress_class)) {
    reasons.push(`candidate is non-progress after repaired-head resolution: ${candidate.progress_class}`);
  }

  if (candidate.progress_class === "exact_external_blocker") {
    if (!candidate.blocker?.trim()) reasons.push("exact external blocker candidate has no blocker text");
    return reasons;
  }

  if (candidate.progress_class !== "external_platform_embodiment") {
    reasons.push(`candidate progress class is not selectable here: ${candidate.progress_class}`);
  }
  if (input.existing_package_boundaries.includes(candidate.module_id) && candidate.module_id !== "route_governor") {
    reasons.push(`package boundary already exists: ${candidate.module_id}`);
  }
  if (candidate.module_id !== "route_governor" && !candidate.produces_new_package_boundary) {
    reasons.push(`candidate does not create the ${candidate.module_id} package boundary`);
  }
  if (executableChanges.length === 0) reasons.push("candidate changes no executable platform file");
  if (behaviorChanges.length === 0) reasons.push("candidate is proof-only and has no behavior file");
  if (candidate.executable_artifacts.length === 0) reasons.push("candidate has no executable artifact evidence");
  if (candidate.routing_artifacts.length === 0) reasons.push("candidate has no routing artifact evidence");
  if (candidate.proof_artifacts.length === 0) reasons.push("candidate has no proof artifact evidence");

  return reasons;
}

function acceptedEvidence(candidate: PostResolutionPlatformCandidate): string[] {
  if (candidate.progress_class === "exact_external_blocker") {
    return [candidate.blocker ?? "exact external blocker"];
  }

  return [
    `module:${candidate.module_id}`,
    ...candidate.changed_files.filter(executablePlatformPath),
    ...candidate.executable_artifacts,
    ...candidate.routing_artifacts,
    ...candidate.proof_artifacts,
  ];
}

export function selectPostResolutionPlatformModule(
  input: PostResolutionPlatformModuleSelectorInput,
): PostResolutionPlatformModuleSelectorVerdict {
  const rejected: RejectedPostResolutionPlatformCandidate[] = [];
  const selectable: SelectedPostResolutionPlatformCandidate[] = [];

  for (const candidate of input.candidates) {
    const reasons = candidateRejections(input, candidate);
    if (reasons.length > 0) {
      rejected.push({ candidate_id: candidate.candidate_id || "<missing>", reasons });
      continue;
    }

    selectable.push({
      candidate_id: candidate.candidate_id,
      module_id: candidate.progress_class === "external_platform_embodiment" ? candidate.module_id : null,
      progress_class: candidate.progress_class as SelectedPostResolutionPlatformCandidate["progress_class"],
      decisive_evidence: acceptedEvidence(candidate),
    });
  }

  selectable.sort((left, right) => {
    if (left.progress_class !== right.progress_class) {
      return left.progress_class === "external_platform_embodiment" ? -1 : 1;
    }
    if (left.module_id && right.module_id) return modulePriority(left.module_id) - modulePriority(right.module_id);
    return 0;
  });

  const selected = selectable[0] ?? null;
  if (!selected) {
    return {
      ok: false,
      action: "block_no_selectable_platform_module",
      branch: input.active_branch,
      head_sha: input.live_head_sha,
      selected: null,
      rejected,
      quarantined_head_shas: quarantinedHeads(input),
      blockers: ["no post-resolution platform module candidate survived executable embodiment selection"],
      next_route: "supply processor-fabric, proof-evaluation, corpus-memory, manifestation-engine, or exact blocker evidence",
    };
  }

  return {
    ok: true,
    action:
      selected.progress_class === "external_platform_embodiment"
        ? "select_platform_module_embodiment"
        : "select_exact_external_blocker",
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    selected,
    rejected,
    quarantined_head_shas: quarantinedHeads(input),
    blockers: selected.progress_class === "exact_external_blocker" ? selected.decisive_evidence : [],
    next_route:
      selected.progress_class === "external_platform_embodiment"
        ? `create or extend the ${selected.module_id} platform package boundary on the live PR head`
        : "remove the exact external blocker before selecting another platform module",
  };
}
