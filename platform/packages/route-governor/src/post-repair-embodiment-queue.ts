export type PostRepairQueueStatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing";

export type PostRepairQueueMoveClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "duplicate_repaired_head_readback"
  | "duplicate_ci_summary"
  | "metadata_reread"
  | "warning_maintenance"
  | "reclose_resolved_blocker";

export type PostRepairQueueAction =
  | "select_post_repair_embodiment"
  | "select_exact_external_blocker"
  | "block_no_admissible_candidate"
  | "block_branch_mismatch"
  | "block_status_not_settled";

export interface PostRepairQueueCandidate {
  candidate_id: string;
  move_class: PostRepairQueueMoveClass;
  branch: string;
  base_head_sha: string;
  artifact_class: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  blocker?: string;
}

export interface PostRepairEmbodimentQueueInput {
  active_branch: string;
  live_head_sha: string;
  repaired_head_sha: string;
  last_status_readback_head_sha: string;
  live_status_verdict: PostRepairQueueStatusVerdict;
  resolved_blocker_ids: string[];
  spent_artifact_classes: string[];
  candidates: PostRepairQueueCandidate[];
}

export interface RejectedPostRepairQueueCandidate {
  candidate_id: string;
  reasons: string[];
}

export interface PostRepairEmbodimentQueueVerdict {
  ok: boolean;
  action: PostRepairQueueAction;
  branch: string;
  head_sha: string;
  selected_candidate_id: string | null;
  retired_head_shas: string[];
  rejected: RejectedPostRepairQueueCandidate[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_CLASSES = new Set<PostRepairQueueMoveClass>([
  "duplicate_repaired_head_readback",
  "duplicate_ci_summary",
  "metadata_reread",
  "warning_maintenance",
  "reclose_resolved_blocker",
]);

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function proofOnlyPath(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function retiredHeads(input: PostRepairEmbodimentQueueInput): string[] {
  const retired = new Set<string>();
  if (input.repaired_head_sha !== input.live_head_sha) retired.add(input.repaired_head_sha);
  if (input.last_status_readback_head_sha !== input.live_head_sha) retired.add(input.last_status_readback_head_sha);
  return [...retired];
}

function base(input: PostRepairEmbodimentQueueInput): Pick<
  PostRepairEmbodimentQueueVerdict,
  "branch" | "head_sha" | "retired_head_shas"
> {
  return {
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    retired_head_shas: retiredHeads(input),
  };
}

function candidateEvidence(candidate: PostRepairQueueCandidate): string[] {
  return [
    candidate.candidate_id,
    candidate.artifact_class,
    ...candidate.changed_files.filter(executablePlatformPath),
    ...candidate.executable_artifacts,
    ...candidate.routing_artifacts,
    ...candidate.proof_artifacts,
  ];
}

function candidateFailures(input: PostRepairEmbodimentQueueInput, candidate: PostRepairQueueCandidate): string[] {
  const failures: string[] = [];
  const executableChanges = candidate.changed_files.filter(executablePlatformPath);
  const behaviorChanges = executableChanges.filter((path) => !proofOnlyPath(path));

  if (!candidate.candidate_id.trim()) failures.push("candidate has no id");
  if (candidate.branch !== input.active_branch) failures.push(`candidate branch ${candidate.branch} does not match ${input.active_branch}`);
  if (candidate.base_head_sha !== input.live_head_sha) {
    failures.push(`candidate base ${candidate.base_head_sha} does not match live head ${input.live_head_sha}`);
  }
  if (!candidate.artifact_class.trim()) failures.push("candidate has no artifact class");
  if (input.spent_artifact_classes.includes(candidate.artifact_class)) {
    failures.push(`candidate repeats spent artifact class: ${candidate.artifact_class}`);
  }
  if (NON_PROGRESS_CLASSES.has(candidate.move_class)) failures.push(`candidate move class is non-progress: ${candidate.move_class}`);

  if (candidate.move_class === "external_platform_embodiment") {
    if (executableChanges.length === 0) failures.push("external embodiment changes no executable platform file");
    if (executableChanges.length > 0 && behaviorChanges.length === 0) {
      failures.push("external embodiment is proof-only and has no behavior file");
    }
    if (candidate.executable_artifacts.length === 0) failures.push("external embodiment has no executable artifact");
    if (candidate.routing_artifacts.length === 0) failures.push("external embodiment has no future-routing artifact");
    if (candidate.proof_artifacts.length === 0) failures.push("external embodiment has no proof artifact");
  }

  if (candidate.move_class === "fresh_status_readback") {
    failures.push("post-repair queue cannot replay status readback after the repaired head is settled");
  }

  if (candidate.move_class === "exact_external_blocker" && !candidate.blocker?.trim()) {
    failures.push("exact blocker candidate has no blocker text");
  }

  return failures;
}

function priority(candidate: PostRepairQueueCandidate): number {
  switch (candidate.move_class) {
    case "external_platform_embodiment":
      return 3;
    case "exact_external_blocker":
      return 2;
    case "fresh_status_readback":
      return 1;
    default:
      return 0;
  }
}

export function routePostRepairEmbodimentQueue(
  input: PostRepairEmbodimentQueueInput,
): PostRepairEmbodimentQueueVerdict {
  if (input.live_status_verdict !== "passing" && input.live_status_verdict !== "passing_with_warnings") {
    return {
      ...base(input),
      ok: false,
      action: "block_status_not_settled",
      selected_candidate_id: null,
      rejected: [],
      decisive_evidence: input.resolved_blocker_ids,
      blockers: [`live status is ${input.live_status_verdict}`],
      next_route: "obtain a settled live-head status surface before selecting post-repair embodiment work",
    };
  }

  const rejected: RejectedPostRepairQueueCandidate[] = [];
  const admissible: PostRepairQueueCandidate[] = [];

  for (const candidate of input.candidates) {
    const failures = candidateFailures(input, candidate);
    if (failures.length > 0) {
      rejected.push({ candidate_id: candidate.candidate_id || "<missing>", reasons: failures });
      continue;
    }
    admissible.push(candidate);
  }

  admissible.sort((left, right) => priority(right) - priority(left));
  const selected = admissible[0];

  if (!selected) {
    return {
      ...base(input),
      ok: false,
      action: "block_no_admissible_candidate",
      selected_candidate_id: null,
      rejected,
      decisive_evidence: input.resolved_blocker_ids,
      blockers: ["no post-repair candidate survives queue admission"],
      next_route: "supply a non-repeated behavior-bearing embodiment candidate or one exact external blocker",
    };
  }

  if (selected.branch !== input.active_branch) {
    return {
      ...base(input),
      ok: false,
      action: "block_branch_mismatch",
      selected_candidate_id: null,
      rejected,
      decisive_evidence: candidateEvidence(selected),
      blockers: [`selected branch ${selected.branch} does not match ${input.active_branch}`],
      next_route: "bind the selected post-repair candidate to the active PR branch",
    };
  }

  if (selected.move_class === "exact_external_blocker") {
    const blocker = selected.blocker?.trim() ?? "";
    return {
      ...base(input),
      ok: true,
      action: "select_exact_external_blocker",
      selected_candidate_id: selected.candidate_id,
      rejected,
      decisive_evidence: [blocker, ...candidateEvidence(selected)],
      blockers: [blocker],
      next_route: "remove the selected blocker before attempting another post-repair embodiment",
    };
  }

  return {
    ...base(input),
    ok: true,
    action: "select_post_repair_embodiment",
    selected_candidate_id: selected.candidate_id,
    rejected,
    decisive_evidence: [
      `repaired head settled: ${input.repaired_head_sha}`,
      `last repaired-head readback settled: ${input.last_status_readback_head_sha}`,
      ...input.resolved_blocker_ids,
      ...candidateEvidence(selected),
    ],
    blockers: [],
    next_route: "commit the selected post-repair embodiment, then bind the next status readback to the moved head",
  };
}
