export type ContinuationAuthoritySourceTier =
  | "live_status_surface"
  | "direct_live_pr_metadata"
  | "current_instruction"
  | "pr_body_summary"
  | "prompt_carried_summary"
  | "memory_receipt";

export type ContinuationAuthorityProgressClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "metadata_reread"
  | "duplicate_ci_summary"
  | "duplicate_comment"
  | "duplicate_label"
  | "local_memory_guard"
  | "guessed_future_ci"
  | "reclose_completed_blocker"
  | "old_repaired_head_blocker";

export type ContinuationAuthorityAction =
  | "select_external_platform_embodiment"
  | "select_fresh_status_readback"
  | "select_exact_external_blocker"
  | "block_no_authorized_candidate";

export interface ContinuationAuthorityCandidate {
  candidate_id: string;
  source_tier: ContinuationAuthoritySourceTier;
  progress_class: ContinuationAuthorityProgressClass;
  branch: string;
  claimed_head_sha?: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  new_check_surface_ids: string[];
  blocker_text?: string;
  artifact_class?: string;
}

export interface ContinuationAuthorityInput {
  active_branch: string;
  live_head_sha: string;
  previous_status_head_sha: string;
  prohibited_progress_classes: ContinuationAuthorityProgressClass[];
  spent_artifact_classes: string[];
  prohibited_blockers: string[];
  candidates: ContinuationAuthorityCandidate[];
}

export interface RejectedContinuationAuthorityCandidate {
  candidate_id: string;
  blockers: string[];
}

export interface SelectedContinuationAuthorityCandidate {
  candidate_id: string;
  source_tier: ContinuationAuthoritySourceTier;
  progress_class: ContinuationAuthorityProgressClass;
  decisive_evidence: string[];
}

export interface ContinuationAuthorityVerdict {
  ok: boolean;
  action: ContinuationAuthorityAction;
  branch: string;
  head_sha: string;
  selected: SelectedContinuationAuthorityCandidate | null;
  rejected: RejectedContinuationAuthorityCandidate[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_CLASSES = new Set<ContinuationAuthorityProgressClass>([
  "metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "guessed_future_ci",
  "reclose_completed_blocker",
  "old_repaired_head_blocker",
]);

const SOURCE_PRIORITY: Record<ContinuationAuthoritySourceTier, number> = {
  live_status_surface: 6,
  direct_live_pr_metadata: 5,
  current_instruction: 4,
  pr_body_summary: 3,
  memory_receipt: 2,
  prompt_carried_summary: 1,
};

const PROGRESS_PRIORITY: Record<ContinuationAuthorityProgressClass, number> = {
  external_platform_embodiment: 3,
  fresh_status_readback: 2,
  exact_external_blocker: 1,
  metadata_reread: 0,
  duplicate_ci_summary: 0,
  duplicate_comment: 0,
  duplicate_label: 0,
  local_memory_guard: 0,
  guessed_future_ci: 0,
  reclose_completed_blocker: 0,
  old_repaired_head_blocker: 0,
};

function executablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function branchOrHeadBlockers(
  input: ContinuationAuthorityInput,
  candidate: ContinuationAuthorityCandidate,
): string[] {
  const blockers: string[] = [];

  if (candidate.branch !== input.active_branch) {
    blockers.push(`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`);
  }

  if (candidate.claimed_head_sha && candidate.claimed_head_sha !== input.live_head_sha) {
    blockers.push(`candidate claims stale head ${candidate.claimed_head_sha}; live head is ${input.live_head_sha}`);
  }

  return blockers;
}

function embodimentBlockers(input: ContinuationAuthorityInput, candidate: ContinuationAuthorityCandidate): string[] {
  const blockers: string[] = [];

  if (!candidate.changed_files.some(executablePlatformPath)) {
    blockers.push("external embodiment candidate changes no executable platform file");
  }
  if (candidate.executable_artifacts.length === 0) {
    blockers.push("external embodiment candidate has no executable artifact evidence");
  }
  if (candidate.routing_artifacts.length === 0) {
    blockers.push("external embodiment candidate has no routing artifact evidence");
  }
  if (candidate.proof_artifacts.length === 0) {
    blockers.push("external embodiment candidate has no proof artifact evidence");
  }
  if (candidate.artifact_class && input.spent_artifact_classes.includes(candidate.artifact_class)) {
    blockers.push(`external embodiment repeats spent artifact class: ${candidate.artifact_class}`);
  }

  return blockers;
}

function freshStatusBlockers(input: ContinuationAuthorityInput, candidate: ContinuationAuthorityCandidate): string[] {
  const headMoved = input.live_head_sha !== input.previous_status_head_sha;
  const hasNewChecks = candidate.new_check_surface_ids.length > 0;
  const sourceCanCarryStatus =
    candidate.source_tier === "live_status_surface" || candidate.source_tier === "direct_live_pr_metadata";
  const blockers: string[] = [];

  if (!headMoved && !hasNewChecks) {
    blockers.push("fresh status readback requires a moved live head or new status surfaces");
  }
  if (!sourceCanCarryStatus) {
    blockers.push(`fresh status readback cannot be selected from ${candidate.source_tier}`);
  }

  return blockers;
}

function exactBlockerBlockers(input: ContinuationAuthorityInput, candidate: ContinuationAuthorityCandidate): string[] {
  const blocker = candidate.blocker_text?.trim();
  if (!blocker) return ["exact blocker candidate has no blocker text"];
  if (input.prohibited_blockers.includes(blocker)) {
    return [`exact blocker is prohibited for this continuation: ${blocker}`];
  }
  if (candidate.source_tier === "prompt_carried_summary" || candidate.source_tier === "pr_body_summary") {
    return [`exact blocker cannot be selected from summary tier ${candidate.source_tier}`];
  }
  return [];
}

function candidateBlockers(input: ContinuationAuthorityInput, candidate: ContinuationAuthorityCandidate): string[] {
  const blockers = branchOrHeadBlockers(input, candidate);

  if (NON_PROGRESS_CLASSES.has(candidate.progress_class) || input.prohibited_progress_classes.includes(candidate.progress_class)) {
    blockers.push(`candidate repeats prohibited progress class: ${candidate.progress_class}`);
  }

  if (candidate.progress_class === "external_platform_embodiment") {
    blockers.push(...embodimentBlockers(input, candidate));
  }

  if (candidate.progress_class === "fresh_status_readback") {
    blockers.push(...freshStatusBlockers(input, candidate));
  }

  if (candidate.progress_class === "exact_external_blocker") {
    blockers.push(...exactBlockerBlockers(input, candidate));
  }

  return blockers;
}

function selectedEvidence(candidate: ContinuationAuthorityCandidate): string[] {
  return [
    candidate.source_tier,
    candidate.progress_class,
    ...(candidate.claimed_head_sha ? [`head ${candidate.claimed_head_sha}`] : []),
    ...candidate.changed_files.filter(executablePlatformPath),
    ...candidate.executable_artifacts,
    ...candidate.routing_artifacts,
    ...candidate.proof_artifacts,
    ...candidate.new_check_surface_ids.map((id) => `status surface ${id}`),
    ...(candidate.blocker_text ? [candidate.blocker_text] : []),
  ];
}

function actionFor(progressClass: ContinuationAuthorityProgressClass): ContinuationAuthorityAction {
  if (progressClass === "external_platform_embodiment") return "select_external_platform_embodiment";
  if (progressClass === "fresh_status_readback") return "select_fresh_status_readback";
  if (progressClass === "exact_external_blocker") return "select_exact_external_blocker";
  return "block_no_authorized_candidate";
}

export function compileContinuationAuthority(
  input: ContinuationAuthorityInput,
): ContinuationAuthorityVerdict {
  const rejected: RejectedContinuationAuthorityCandidate[] = [];
  const selectable: ContinuationAuthorityCandidate[] = [];

  for (const candidate of input.candidates) {
    const blockers = candidateBlockers(input, candidate);
    if (blockers.length > 0) {
      rejected.push({ candidate_id: candidate.candidate_id, blockers });
      continue;
    }
    selectable.push(candidate);
  }

  selectable.sort((left, right) => {
    const progressDelta = PROGRESS_PRIORITY[right.progress_class] - PROGRESS_PRIORITY[left.progress_class];
    if (progressDelta !== 0) return progressDelta;
    return SOURCE_PRIORITY[right.source_tier] - SOURCE_PRIORITY[left.source_tier];
  });

  const selected = selectable[0];
  if (!selected) {
    return {
      ok: false,
      action: "block_no_authorized_candidate",
      branch: input.active_branch,
      head_sha: input.live_head_sha,
      selected: null,
      rejected,
      blockers: ["no continuation candidate survived live-head source authority"],
      next_route: "supply a non-repeated executable embodiment, live-head status readback, or exact blocker from direct evidence",
    };
  }

  return {
    ok: true,
    action: actionFor(selected.progress_class),
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    selected: {
      candidate_id: selected.candidate_id,
      source_tier: selected.source_tier,
      progress_class: selected.progress_class,
      decisive_evidence: selectedEvidence(selected),
    },
    rejected,
    blockers: [],
    next_route:
      selected.progress_class === "external_platform_embodiment"
        ? "commit the selected executable embodiment, then bind status readback to the new head"
        : "release only the selected live-head-bound continuation class",
  };
}
