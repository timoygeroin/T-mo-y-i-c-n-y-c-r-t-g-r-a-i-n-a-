export type ResolvedReadbackMoveClass =
  | "external_platform_embodiment"
  | "exact_external_blocker"
  | "fresh_status_readback"
  | "duplicate_ci_summary"
  | "metadata_reread"
  | "duplicate_comment"
  | "duplicate_label"
  | "local_memory_guard"
  | "guessed_future_ci"
  | "reclose_completed_blocker"
  | "old_repaired_head_status_blocker";

export type ResolvedReadbackAuthorityAction =
  | "admit_post_resolution_embodiment"
  | "admit_post_resolution_blocker"
  | "block_unresolved_boundary"
  | "block_old_repaired_head_blocker"
  | "block_non_progress_replay"
  | "block_incomplete_embodiment";

export interface ResolvedReadbackCheckReceipt {
  run_id: string;
  workflow_name: string;
  event: "push" | "pull_request";
  head_sha: string;
  conclusion: "success" | "failure" | "cancelled" | "skipped" | "timed_out" | "action_required" | "neutral";
}

export interface ResolvedReadbackEmbodimentCandidate {
  move_class: ResolvedReadbackMoveClass;
  artifact_class: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  spent_artifact_classes: string[];
  blocker?: string;
}

export interface ResolvedReadbackAuthorityInput {
  active_branch: string;
  branch: string;
  resolved_head_sha: string;
  live_head_sha: string;
  issue_completed: boolean;
  blocker_label_removed: boolean;
  pr_ready_for_review: boolean;
  checks: ResolvedReadbackCheckReceipt[];
  warnings: string[];
  candidate: ResolvedReadbackEmbodimentCandidate;
}

export interface ResolvedReadbackAuthorityVerdict {
  ok: boolean;
  action: ResolvedReadbackAuthorityAction;
  branch: string;
  head_sha: string;
  accepted_check_run_ids: string[];
  quarantined_move_classes: ResolvedReadbackMoveClass[];
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

const REQUIRED_WORKFLOWS = new Set([
  "Monday Platform CI",
  "Route Governor Proof",
  "Monday Platform Route Governor",
  "PR Head Status Readback",
]);

const NON_PROGRESS_CLASSES = new Set<ResolvedReadbackMoveClass>([
  "fresh_status_readback",
  "duplicate_ci_summary",
  "metadata_reread",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "guessed_future_ci",
  "reclose_completed_blocker",
]);

const OLD_REPAIRED_HEAD_BLOCKER: ResolvedReadbackMoveClass = "old_repaired_head_status_blocker";

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function proofOnlyPath(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function successfulResolvedChecks(input: ResolvedReadbackAuthorityInput): ResolvedReadbackCheckReceipt[] {
  return input.checks.filter((check) => check.head_sha === input.resolved_head_sha && check.conclusion === "success");
}

function missingWorkflowEvidence(checks: ResolvedReadbackCheckReceipt[]): string[] {
  const covered = new Set(checks.map((check) => check.workflow_name));
  return [...REQUIRED_WORKFLOWS].filter((workflow) => !covered.has(workflow));
}

function boundaryBlockers(input: ResolvedReadbackAuthorityInput): string[] {
  const checks = successfulResolvedChecks(input);
  const missing = missingWorkflowEvidence(checks);
  const blockers: string[] = [];

  if (input.branch !== input.active_branch) {
    blockers.push(`resolved-readback branch ${input.branch} does not match active branch ${input.active_branch}`);
  }
  if (input.live_head_sha !== input.resolved_head_sha) {
    blockers.push(`live head ${input.live_head_sha} does not match resolved readback head ${input.resolved_head_sha}`);
  }
  if (!input.issue_completed) blockers.push("resolved blocker issue is not closed as completed");
  if (!input.blocker_label_removed) blockers.push("blocked: ci-status-readback label is still present");
  if (!input.pr_ready_for_review) blockers.push("PR is not ready for review");
  if (checks.length < 7) blockers.push(`resolved readback has ${checks.length} successful checks, expected at least 7`);
  blockers.push(...missing.map((workflow) => `resolved readback is missing successful workflow: ${workflow}`));

  return blockers;
}

function embodimentBlockers(candidate: ResolvedReadbackEmbodimentCandidate): string[] {
  const executableChanges = candidate.changed_files.filter(executablePlatformPath);
  const behaviorChanges = executableChanges.filter((path) => !proofOnlyPath(path));
  const blockers: string[] = [];

  if (!candidate.artifact_class.trim()) blockers.push("post-resolution embodiment has no artifact class");
  if (candidate.spent_artifact_classes.includes(candidate.artifact_class)) {
    blockers.push(`post-resolution embodiment repeats spent artifact class: ${candidate.artifact_class}`);
  }
  if (executableChanges.length === 0) blockers.push("post-resolution embodiment changes no executable platform files");
  if (executableChanges.length > 0 && behaviorChanges.length === 0) {
    blockers.push("post-resolution embodiment is proof-only and changes no behavior file");
  }
  if (candidate.executable_artifacts.length === 0) blockers.push("post-resolution embodiment has no executable artifact evidence");
  if (candidate.routing_artifacts.length === 0) blockers.push("post-resolution embodiment has no future-routing artifact evidence");
  if (candidate.proof_artifacts.length === 0) blockers.push("post-resolution embodiment has no proof artifact evidence");

  return blockers;
}

function base(input: ResolvedReadbackAuthorityInput): Pick<
  ResolvedReadbackAuthorityVerdict,
  "branch" | "head_sha" | "warnings" | "accepted_check_run_ids" | "quarantined_move_classes"
> {
  return {
    branch: input.branch,
    head_sha: input.live_head_sha,
    warnings: input.warnings,
    accepted_check_run_ids: successfulResolvedChecks(input).map((check) => check.run_id),
    quarantined_move_classes: [
      OLD_REPAIRED_HEAD_BLOCKER,
      "duplicate_ci_summary",
      "metadata_reread",
      "duplicate_comment",
      "duplicate_label",
      "local_memory_guard",
      "guessed_future_ci",
      "reclose_completed_blocker",
    ],
  };
}

function block(
  input: ResolvedReadbackAuthorityInput,
  action: Exclude<
    ResolvedReadbackAuthorityAction,
    "admit_post_resolution_embodiment" | "admit_post_resolution_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ResolvedReadbackAuthorityVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

export function compileResolvedReadbackAuthority(
  input: ResolvedReadbackAuthorityInput,
): ResolvedReadbackAuthorityVerdict {
  const boundary = boundaryBlockers(input);
  if (boundary.length > 0) {
    return block(
      input,
      "block_unresolved_boundary",
      boundary,
      "complete repaired-head readback, blocker retirement, and PR-ready state before post-resolution routing",
    );
  }

  const candidate = input.candidate;

  if (candidate.move_class === OLD_REPAIRED_HEAD_BLOCKER) {
    return block(
      input,
      "block_old_repaired_head_blocker",
      [`repaired-head status-readback blocker is resolved for ${input.resolved_head_sha}`],
      "do not emit the old repaired-head blocker; choose a new executable embodiment or exact new blocker",
      [`resolved head ${input.resolved_head_sha}`],
    );
  }

  if (NON_PROGRESS_CLASSES.has(candidate.move_class)) {
    return block(
      input,
      "block_non_progress_replay",
      [`post-resolution move repeats non-progress class: ${candidate.move_class}`],
      "advance only by executable embodiment or by one exact blocker for the next embodiment step",
      [`resolved head ${input.resolved_head_sha}`],
    );
  }

  if (candidate.move_class === "exact_external_blocker") {
    const blocker = candidate.blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_incomplete_embodiment",
        ["post-resolution exact blocker has no blocker text"],
        "name the exact next-step blocker or supply a complete executable embodiment",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_post_resolution_blocker",
      decisive_evidence: [`resolved repaired-head boundary ${input.resolved_head_sha}`, blocker],
      blockers: [blocker],
      next_route: "remove the named post-resolution blocker before attempting another embodiment step",
    };
  }

  const blockers = embodimentBlockers(candidate);
  if (blockers.length > 0) {
    return block(
      input,
      "block_incomplete_embodiment",
      blockers,
      "supply behavior-bearing executable files, routing evidence, proof evidence, and an unspent artifact class",
      [`resolved head ${input.resolved_head_sha}`],
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_post_resolution_embodiment",
    decisive_evidence: [
      `resolved repaired-head boundary ${input.resolved_head_sha}`,
      candidate.artifact_class,
      ...candidate.changed_files.filter(executablePlatformPath),
      ...candidate.executable_artifacts,
      ...candidate.routing_artifacts,
      ...candidate.proof_artifacts,
    ],
    blockers: [],
    next_route: "commit the post-resolution embodiment, then require status readback only for the moved head",
  };
}
