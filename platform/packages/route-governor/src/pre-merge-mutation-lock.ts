export type PreMergeStatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "no_status_surface";
export type PreMergeMutationKind = "ordinary_embodiment" | "critical_repair" | "status_readback" | "documentation_only";
export type PreMergeMergeability = "mergeable" | "conflicting" | "unknown" | "blocked";

export type PreMergeMutationLockAction =
  | "lock_branch_for_merge_handoff"
  | "admit_critical_repair_before_merge"
  | "route_to_status_readback"
  | "route_to_review_resolution"
  | "route_to_mergeability_repair"
  | "block_draft_pr"
  | "block_branch_mismatch"
  | "block_replayed_lock"
  | "block_missing_lock_id"
  | "block_unresolved_external_blockers";

export interface PreMergeMutationCandidate {
  candidate_id: string;
  kind: PreMergeMutationKind;
  changed_files: string[];
  reason: string;
  blocker_signature?: string;
}

export interface PreMergeMutationLockInput {
  repository_full_name: string;
  pr_number: number;
  branch: string;
  active_branch: string;
  live_head_sha: string;
  pr_is_draft: boolean;
  status_verdict: PreMergeStatusVerdict;
  mergeability: PreMergeMergeability;
  required_approval_count: number;
  approvals: string[];
  change_requests: string[];
  unresolved_review_threads: number;
  open_external_blockers: string[];
  candidate_mutations: PreMergeMutationCandidate[];
  lock_id: string;
  spent_lock_ids: string[];
}

export interface PreMergeMutationLockVerdict {
  ok: boolean;
  action: PreMergeMutationLockAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  admitted_candidate_id: string | null;
  lock_id: string | null;
  mutation_policy: "block_new_branch_mutations" | "allow_only_critical_repair" | "continue_pre_merge_repair";
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function statusReady(status: PreMergeStatusVerdict): boolean {
  return status === "passing" || status === "passing_with_warnings";
}

function normalized(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function base(input: PreMergeMutationLockInput): Pick<
  PreMergeMutationLockVerdict,
  "repository_full_name" | "pr_number" | "branch" | "head_sha"
> {
  return {
    repository_full_name: input.repository_full_name,
    pr_number: input.pr_number,
    branch: input.branch,
    head_sha: input.live_head_sha,
  };
}

function evidence(input: PreMergeMutationLockInput): string[] {
  return [
    `live head ${input.live_head_sha}`,
    `status ${input.status_verdict}`,
    `mergeability ${input.mergeability}`,
    `approvals ${normalized(input.approvals).join(",") || "<none>"}`,
  ];
}

function block(
  input: PreMergeMutationLockInput,
  action: Exclude<PreMergeMutationLockAction, "lock_branch_for_merge_handoff" | "admit_critical_repair_before_merge">,
  blockers: string[],
  nextRoute: string,
  policy: PreMergeMutationLockVerdict["mutation_policy"] = "continue_pre_merge_repair",
): PreMergeMutationLockVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    admitted_candidate_id: null,
    lock_id: null,
    mutation_policy: policy,
    decisive_evidence: evidence(input),
    blockers,
    next_route: nextRoute,
  };
}

function criticalRepairCandidates(input: PreMergeMutationLockInput): PreMergeMutationCandidate[] {
  return input.candidate_mutations.filter(
    (candidate) =>
      candidate.kind === "critical_repair" &&
      candidate.blocker_signature?.trim() &&
      candidate.changed_files.some(executablePlatformPath),
  );
}

export function compilePreMergeMutationLock(input: PreMergeMutationLockInput): PreMergeMutationLockVerdict {
  if (input.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`pre-merge lock branch ${input.branch} does not match active branch ${input.active_branch}`],
      "bind the pre-merge lock to the active PR branch before release",
    );
  }

  if (input.pr_is_draft) {
    return block(
      input,
      "block_draft_pr",
      ["PR is draft; pre-merge mutation lock is not active"],
      "mark the PR ready for review before locking branch mutations for merge handoff",
    );
  }

  const lockId = input.lock_id.trim();
  if (!lockId) {
    return block(input, "block_missing_lock_id", ["pre-merge mutation lock has no lock id"], "compile a durable lock id");
  }

  if (input.spent_lock_ids.includes(lockId)) {
    return block(
      input,
      "block_replayed_lock",
      [`pre-merge mutation lock already spent: ${lockId}`],
      "do not replay a spent pre-merge mutation lock",
    );
  }

  const openBlockers = normalized(input.open_external_blockers);
  if (openBlockers.length > 0) {
    const critical = criticalRepairCandidates(input)[0];
    if (critical) {
      return {
        ...base(input),
        ok: true,
        action: "admit_critical_repair_before_merge",
        admitted_candidate_id: critical.candidate_id,
        lock_id: null,
        mutation_policy: "allow_only_critical_repair",
        decisive_evidence: [...evidence(input), `critical repair ${critical.candidate_id}`, critical.blocker_signature ?? ""].filter(
          Boolean,
        ),
        blockers: openBlockers,
        next_route: "commit only the named critical repair, then re-enter the pre-merge lock on the moved head",
      };
    }

    return block(
      input,
      "block_unresolved_external_blockers",
      openBlockers,
      "resolve the named external blockers or attach one critical executable repair before merge handoff",
      "allow_only_critical_repair",
    );
  }

  if (!statusReady(input.status_verdict)) {
    return block(
      input,
      "route_to_status_readback",
      [`live-head status is ${input.status_verdict}`],
      "obtain passing live-head status or repair the surfaced failure before locking mutations",
    );
  }

  const approvals = normalized(input.approvals);
  const changeRequests = normalized(input.change_requests);
  if (approvals.length < Math.max(1, input.required_approval_count) || changeRequests.length > 0 || input.unresolved_review_threads > 0) {
    return block(
      input,
      "route_to_review_resolution",
      [
        ...(approvals.length < Math.max(1, input.required_approval_count)
          ? [`approvals ${approvals.length} below required ${Math.max(1, input.required_approval_count)}`]
          : []),
        ...changeRequests.map((reviewer) => `changes requested by ${reviewer}`),
        ...(input.unresolved_review_threads > 0 ? [`unresolved review threads ${input.unresolved_review_threads}`] : []),
      ],
      "resolve review state before locking branch mutations for merge handoff",
    );
  }

  if (input.mergeability !== "mergeable") {
    return block(
      input,
      "route_to_mergeability_repair",
      [`mergeability is ${input.mergeability}`],
      "restore mergeability before locking branch mutations for merge handoff",
    );
  }

  const ordinaryExecutableMutations = input.candidate_mutations.filter(
    (candidate) => candidate.kind === "ordinary_embodiment" && candidate.changed_files.some(executablePlatformPath),
  );

  return {
    ...base(input),
    ok: true,
    action: "lock_branch_for_merge_handoff",
    admitted_candidate_id: null,
    lock_id: lockId,
    mutation_policy: "block_new_branch_mutations",
    decisive_evidence: [
      ...evidence(input),
      `lock ${lockId}`,
      ...(ordinaryExecutableMutations.length > 0
        ? ordinaryExecutableMutations.map((candidate) => `blocked ordinary mutation ${candidate.candidate_id}`)
        : ["no ordinary executable mutation required before merge"]),
    ],
    blockers: [],
    next_route: "preserve the reviewed live head and route to the guarded merge command instead of adding another embodiment commit",
  };
}
