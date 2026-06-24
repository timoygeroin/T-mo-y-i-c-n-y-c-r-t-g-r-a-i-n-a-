export type ResolvedBoundaryStatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing";

export type ResolvedBoundaryMoveClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "duplicate_ci_summary"
  | "duplicate_comment"
  | "duplicate_label"
  | "local_memory_guard"
  | "metadata_reread"
  | "reclose_resolved_blocker"
  | "warning_maintenance";

export type ResolvedBoundaryAction =
  | "admit_resolved_boundary_embodiment"
  | "route_to_exact_external_blocker"
  | "block_boundary_unresolved"
  | "block_non_progress_move"
  | "block_stale_repaired_head_replay"
  | "block_incomplete_embodiment";

export interface ResolvedBoundaryEvidence {
  repaired_head_sha: string;
  live_head_sha: string;
  status_head_sha: string;
  status_verdict: ResolvedBoundaryStatusVerdict;
  successful_check_run_ids: string[];
  resolved_blocker_ids: string[];
  blocker_label_removed: boolean;
  pr_ready_for_review: boolean;
  non_blocking_warnings: string[];
}

export interface ResolvedBoundaryEmbodimentCandidate {
  candidate_id: string;
  move_class: ResolvedBoundaryMoveClass;
  branch: string;
  base_head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  blocker?: string;
}

export interface ResolvedBoundaryEmbodimentInput {
  active_branch: string;
  evidence: ResolvedBoundaryEvidence;
  prohibited_move_classes: ResolvedBoundaryMoveClass[];
  spent_candidate_ids: string[];
  candidate: ResolvedBoundaryEmbodimentCandidate;
}

export interface ResolvedBoundaryEmbodimentVerdict {
  ok: boolean;
  action: ResolvedBoundaryAction;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  quarantined_head_shas: string[];
  warnings: string[];
  next_route: string;
}

const NON_PROGRESS = new Set<ResolvedBoundaryMoveClass>([
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "metadata_reread",
  "reclose_resolved_blocker",
]);

function executablePath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function proofOnly(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function base(input: ResolvedBoundaryEmbodimentInput): Pick<ResolvedBoundaryEmbodimentVerdict, "branch" | "head_sha" | "quarantined_head_shas" | "warnings"> {
  const quarantined = new Set<string>();
  if (input.evidence.repaired_head_sha !== input.evidence.live_head_sha) quarantined.add(input.evidence.repaired_head_sha);
  if (input.evidence.status_head_sha !== input.evidence.live_head_sha) quarantined.add(input.evidence.status_head_sha);
  if (input.candidate.base_head_sha !== input.evidence.live_head_sha) quarantined.add(input.candidate.base_head_sha);
  return {
    branch: input.active_branch,
    head_sha: input.evidence.live_head_sha,
    quarantined_head_shas: [...quarantined],
    warnings: input.evidence.non_blocking_warnings,
  };
}

function reject(
  input: ResolvedBoundaryEmbodimentInput,
  action: Exclude<ResolvedBoundaryAction, "admit_resolved_boundary_embodiment" | "route_to_exact_external_blocker">,
  blockers: string[],
  next_route: string,
  decisive_evidence: string[] = [],
): ResolvedBoundaryEmbodimentVerdict {
  return { ...base(input), ok: false, action, decisive_evidence, blockers, next_route };
}

function boundaryFailures(evidence: ResolvedBoundaryEvidence): string[] {
  const failures: string[] = [];
  if (evidence.status_head_sha !== evidence.repaired_head_sha) failures.push(`status head ${evidence.status_head_sha} is not repaired head ${evidence.repaired_head_sha}`);
  if (evidence.status_verdict !== "passing" && evidence.status_verdict !== "passing_with_warnings") failures.push(`repaired-head status is ${evidence.status_verdict}`);
  if (evidence.successful_check_run_ids.length === 0) failures.push("resolved boundary has no successful check-run or workflow-run ids");
  if (evidence.resolved_blocker_ids.length === 0) failures.push("resolved boundary names no retired blocker id");
  if (!evidence.blocker_label_removed) failures.push("resolved boundary did not remove the blocker label");
  if (!evidence.pr_ready_for_review) failures.push("resolved boundary did not leave the PR ready for review");
  return failures;
}

function embodimentFailures(input: ResolvedBoundaryEmbodimentInput): string[] {
  const candidate = input.candidate;
  const executable = candidate.changed_files.filter(executablePath);
  const behavior = executable.filter((path) => !proofOnly(path));
  const failures: string[] = [];
  if (candidate.branch !== input.active_branch) failures.push(`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`);
  if (candidate.base_head_sha !== input.evidence.live_head_sha) failures.push(`candidate base ${candidate.base_head_sha} is not live head ${input.evidence.live_head_sha}`);
  if (!candidate.candidate_id.trim()) failures.push("candidate has no candidate id");
  if (input.spent_candidate_ids.includes(candidate.candidate_id)) failures.push(`candidate already spent: ${candidate.candidate_id}`);
  if (executable.length === 0) failures.push("candidate changes no executable platform file");
  if (executable.length > 0 && behavior.length === 0) failures.push("candidate is proof-only and has no behavior file");
  if (candidate.executable_artifacts.length === 0) failures.push("candidate has no executable artifact evidence");
  if (candidate.routing_artifacts.length === 0) failures.push("candidate has no future-routing artifact evidence");
  if (candidate.proof_artifacts.length === 0) failures.push("candidate has no proof artifact evidence");
  return failures;
}

export function routeResolvedBoundaryEmbodiment(input: ResolvedBoundaryEmbodimentInput): ResolvedBoundaryEmbodimentVerdict {
  const boundary = boundaryFailures(input.evidence);
  if (boundary.length > 0) {
    return reject(input, "block_boundary_unresolved", boundary, "resolve the repaired-head status boundary before post-resolution embodiment");
  }

  const candidate = input.candidate;
  if (candidate.move_class === "exact_external_blocker") {
    const blocker = candidate.blocker?.trim();
    return {
      ...base(input),
      ok: Boolean(blocker),
      action: "route_to_exact_external_blocker",
      decisive_evidence: blocker ? [blocker, `live head ${input.evidence.live_head_sha}`] : [],
      blockers: blocker ? [blocker] : ["exact external blocker candidate has no blocker text"],
      next_route: blocker ? "remove the named blocker before another post-resolution embodiment" : "name one exact blocker or choose executable embodiment",
    };
  }

  if (NON_PROGRESS.has(candidate.move_class) || input.prohibited_move_classes.includes(candidate.move_class)) {
    return reject(
      input,
      "block_non_progress_move",
      [`resolved-boundary move class is non-progress: ${candidate.move_class}`],
      "choose a new executable platform embodiment; do not replay summaries, comments, labels, metadata, or closure",
      [candidate.move_class, ...input.evidence.resolved_blocker_ids],
    );
  }

  if (candidate.move_class === "fresh_status_readback") {
    return reject(
      input,
      "block_stale_repaired_head_replay",
      ["fresh status readback is not progress while the repaired-head boundary is already resolved and no new live-head checks are supplied"],
      "move the branch with a behavior-bearing embodiment before the next status readback",
      input.evidence.successful_check_run_ids,
    );
  }

  if (candidate.move_class === "warning_maintenance") {
    return reject(
      input,
      "block_non_progress_move",
      input.evidence.non_blocking_warnings.map((warning) => `non-blocking warning remains below embodiment: ${warning}`),
      "defer warning maintenance until no stronger embodiment route is active",
      input.evidence.non_blocking_warnings,
    );
  }

  const embodiment = embodimentFailures(input);
  if (embodiment.length > 0) {
    return reject(input, "block_incomplete_embodiment", embodiment, "supply a live-head behavior-bearing embodiment candidate with executable, routing, and proof evidence");
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_resolved_boundary_embodiment",
    decisive_evidence: [
      `resolved repaired head ${input.evidence.repaired_head_sha}`,
      `live head ${input.evidence.live_head_sha}`,
      ...input.evidence.successful_check_run_ids.map((id) => `success:${id}`),
      ...input.evidence.resolved_blocker_ids.map((id) => `retired-blocker:${id}`),
      ...input.evidence.non_blocking_warnings.map((warning) => `deferred-warning:${warning}`),
      ...candidate.changed_files.filter(executablePath),
      ...candidate.executable_artifacts,
      ...candidate.routing_artifacts,
      ...candidate.proof_artifacts,
    ],
    blockers: [],
    next_route: "commit the post-resolution embodiment, then bind the next status readback only to the moved live head",
  };
}
