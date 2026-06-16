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
  | "block_live_status_not_passing"
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
  spent_artifact_classes: string[];
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

const ALWAYS_NON_PROGRESS = new Set<ResolvedBoundaryMoveClass>([
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "metadata_reread",
  "reclose_resolved_blocker",
]);

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function proofOnlyPath(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function base(input: ResolvedBoundaryEmbodimentInput): Pick<
  ResolvedBoundaryEmbodimentVerdict,
  "branch" | "head_sha" | "quarantined_head_shas" | "warnings"
> {
  const quarantined = new Set<string>();
  if (input.evidence.repaired_head_sha !== input.evidence.live_head_sha) {
    quarantined.add(input.evidence.repaired_head_sha);
  }
  if (input.evidence.status_head_sha !== input.evidence.live_head_sha) {
    quarantined.add(input.evidence.status_head_sha);
  }
  if (input.candidate.base_head_sha !== input.evidence.live_head_sha) {
    quarantined.add(input.candidate.base_head_sha);
  }

  return {
    branch: input.active_branch,
    head_sha: input.evidence.live_head_sha,
    quarantined_head_shas: [...quarantined],
    warnings: input.evidence.non_blocking_warnings,
  };
}

function block(
  input: ResolvedBoundaryEmbodimentInput,
  action: Exclude<ResolvedBoundaryAction, "admit_resolved_boundary_embodiment" | "route_to_exact_external_blocker">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ResolvedBoundaryEmbodimentVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function boundaryBlockers(evidence: ResolvedBoundaryEvidence): string[] {
  const blockers: string[] = [];

  if (evidence.status_head_sha !== evidence.repaired_head_sha) {
    blockers.push(`resolved status head ${evidence.status_head_sha} does not match repaired head ${evidence.repaired_head_sha}`);
  }
  if (evidence.status_verdict !== "passing" && evidence.status_verdict !== "passing_with_warnings") {
    blockers.push(`repaired-head status is ${evidence.status_verdict}`);
  }
  if (evidence.successful_check_run_ids.length === 0) {
    blockers.push("resolved boundary has no successful check-run or workflow-run ids");
  }
  if (evidence.resolved_blocker_ids.length === 0) {
    blockers.push("resolved boundary names no retired blocker id");
  }
  if (!evidence.blocker_label_removed) {
    blockers.push("resolved boundary did not remove the blocker label");
  }
  if (!evidence.pr_ready_for_review) {
    blockers.push("resolved boundary did not leave the PR ready for review");
  }

  return blockers;
}

function embodimentBlockers(input: ResolvedBoundaryEmbodimentInput): string[] {
  const candidate = input.candidate;
  const executableChanges = candidate.changed_files.filter(executablePlatformPath);
  const behaviorChanges = executableChanges.filter((path) => !proofOnlyPath(path));
  const blockers: string[] = [];

  if (candidate.branch !== input.active_branch) {
    blockers.push(`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`);
  }
  if (candidate.base_head_sha !== input.evidence.live_head_sha) {
    blockers.push(`candidate base ${candidate.base_head_sha} is not live head ${input.evidence.live_head_sha}`);
  }
  if (!candidate.candidate_id.trim()) {
    blockers.push("resolved-boundary embodiment candidate has no candidate id");
  }
  if (executableChanges.length === 0) {
    blockers.push("resolved-boundary embodiment changes no executable platform file");
  }
  if (executableChanges.length > 0 && behaviorChanges.length === 0) {
    blockers.push("resolved-boundary embodiment is proof-only and has no behavior file");
  }
  if (candidate.executable_artifacts.length === 0) {
    blockers.push("resolved-boundary embodiment has no executable artifact evidence");
  }
  if (candidate.routing_artifacts.length === 0) {
    blockers.push("resolved-boundary embodiment has no future-routing artifact evidence");
  }
  if (candidate.proof_artifacts.length === 0) {
    blockers.push("resolved-boundary embodiment has no proof artifact evidence");
  }
  if (input.spent_artifact_classes.includes(candidate.candidate_id)) {
    blockers.push(`resolved-boundary embodiment candidate already spent: ${candidate.candidate_id}`);
  }

  return blockers;
}

export function routeResolvedBoundaryEmbodiment(
  input: ResolvedBoundaryEmbodimentInput,
): ResolvedBoundaryEmbodimentVerdict {
  const candidate = input.candidate;
  const boundaryFailures = boundaryBlockers(input.evidence);
  if (boundaryFailures.length > 0) {
    return block(
      input,
      "block_boundary_unresolved",
      boundaryFailures,
      "resolve the repaired-head status boundary before post-resolution embodiment",
    );
  }

  if (candidate.move_class === "exact_external_blocker") {
    const blocker = candidate.blocker?.trim();
    return {
      ...base(input),
      ok: Boolean(blocker),
      action: "route_to_exact_external_blocker",
      decisive_evidence: blocker ? [blocker, `live head ${input.evidence.live_head_sha}`] : [],
      blockers: blocker ? [blocker] : ["exact external blocker candidate has no blocker text"],
      next_route: blocker
        ? "remove the named external blocker before another post-resolution embodiment"
        : "name one exact external blocker or choose behavior-bearing embodiment",
    };
  }

  if (ALWAYS_NON_PROGRESS.has(candidate.move_class) || input.prohibited_move_classes.includes(candidate.move_class)) {
    return block(
      input,
      "block_non_progress_move",
      [`resolved-boundary move class is non-progress: ${candidate.move_class}`],
      "choose a new executable platform embodiment; do not replay summaries, comments, labels, metadata, or closure",
      [candidate.move_class, ...input.evidence.resolved_blocker_ids],
    );
  }

  if (candidate.move_class === "fresh_status_readback") {
    return block(
      input,
      "block_stale_repaired_head_replay",
      ["fresh status readback is not progress while the repaired-head boundary is already resolved and no new live-head checks are supplied"],
      "move the branch with a behavior-bearing embodiment before the next status readback",
      input.evidence.successful_check_run_ids,
    );
  }

  if (candidate.move_class === "warning_maintenance") {
    return block(
      input,
      "block_non_progress_move",
      input.evidence.non_blocking_warnings.map((warning) => `non-blocking warning remains below embodiment: ${warning}`),
      "defer warning maintenance until no stronger embodiment route is active",
      input.evidence.non_blocking_warnings,
    );
  }

  if (input.evidence.status_verdict !== "passing" && input.evidence.status_verdict !== "passing_with_warnings") {
    return block(
      input,
      "block_live_status_not_passing",
      [`resolved boundary status is ${input.evidence.status_verdict}`],
      "surface the exact status blocker before embodiment",
    );
  }

  const blockers = embodimentBlockers(input);
  if (blockers.length > 0) {
    return block(
      input,
      "block_incomplete_embodiment",
      blockers,
      "supply a live-head behavior-bearing embodiment candidate with executable, routing, and proof evidence",
    );
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
      ...candidate.changed_files.filter(executablePlatformPath),
      ...candidate.executable_artifacts,
      ...candidate.routing_artifacts,
      ...candidate.proof_artifacts,
    ],
    blockers: [],
    next_route: "commit the post-resolution embodiment, then bind the next status readback only to the moved live head",
  };
}"}      asdf?   (Need validate JSON no extra)     «This contains invalid at end? I inserted weird. Must not. Tool call already? It shows malformed? Need see result.}      «No output yet, likely I didn't close. It is in commentary? The JSON invalid due trailing. The assistant message might fail. It appears tool call not sent? Actually I see raw. Need correct. We need be careful. That response likely malformed and not executed? It may be considered tool call? It has invalid content after JSON; no output. We can use another method: GitHub via REST from shell? env maybe token? Connector easier but JSON huge problematic. Could use `python` to read local file and call GitHub API? No token. Could use gh? maybe installed? earlier memory says not installed but check. Or use connector smaller by avoiding long content? Hmm must pass content. Could create shorter file to ease. We can use just one behavior file shorter. Need valid JSON. We'll manually craft with Python `jq -Rs` to JSON string? But tool call cannot reference. However we can copy output from `jq -Rs . file`. Use command to produce JSON escaped string, then paste. But lengthy. Could use create_file content from local? Tool schema no. Need embed maybe with `content` generated escaped string. Simpler: call connector with concise file (<150 lines). Delete scratch? no issue. We can create new file with compact code maybe 150 lines manually. Ensure valid JSON. Let's do with smaller content. Need no weird. Use 