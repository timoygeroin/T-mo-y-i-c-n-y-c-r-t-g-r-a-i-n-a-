export type MergeAttemptStatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "missing";

export type MergeAttemptAdmissionAction =
  | "admit_merge_attempt"
  | "block_stale_command_head"
  | "block_stale_status_head"
  | "block_status_not_passing"
  | "block_stale_review_head"
  | "block_review_not_approved"
  | "block_mergeability_not_current"
  | "block_mergeability_false"
  | "block_repeated_attempt";

export interface MergeAttemptAdmissionInput {
  repository_full_name: string;
  pr_number: number;
  branch: string;
  live_head_sha: string;
  command_head_sha: string;
  status_head_sha: string;
  status_verdict: MergeAttemptStatusVerdict;
  review_head_sha: string;
  approvals: string[];
  change_requests: string[];
  required_approval_count: number;
  mergeability_head_sha: string;
  mergeable: boolean | null;
  attempt_id: string;
  spent_attempt_ids: string[];
}

export interface MergeAttemptAdmissionVerdict {
  ok: boolean;
  action: MergeAttemptAdmissionAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  attempt_id: string | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function normalize(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function base(input: MergeAttemptAdmissionInput): Pick<
  MergeAttemptAdmissionVerdict,
  "repository_full_name" | "pr_number" | "branch" | "head_sha" | "attempt_id"
> {
  return {
    repository_full_name: input.repository_full_name,
    pr_number: input.pr_number,
    branch: input.branch,
    head_sha: input.live_head_sha,
    attempt_id: input.attempt_id.trim() || null,
  };
}

function evidence(input: MergeAttemptAdmissionInput): string[] {
  return [
    `live head ${input.live_head_sha}`,
    `command head ${input.command_head_sha}`,
    `status head ${input.status_head_sha}`,
    `review head ${input.review_head_sha}`,
    `mergeability head ${input.mergeability_head_sha}`,
  ];
}

function block(
  input: MergeAttemptAdmissionInput,
  action: Exclude<MergeAttemptAdmissionAction, "admit_merge_attempt">,
  blockers: string[],
  nextRoute: string,
  extraEvidence: string[] = [],
): MergeAttemptAdmissionVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: [...evidence(input), ...extraEvidence],
    blockers,
    next_route: nextRoute,
  };
}

export function admitMergeAttempt(input: MergeAttemptAdmissionInput): MergeAttemptAdmissionVerdict {
  const attemptId = input.attempt_id.trim();
  const approvals = normalize(input.approvals);
  const changeRequests = normalize(input.change_requests);
  const requiredApprovals = Math.max(1, input.required_approval_count);

  if (input.command_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_command_head",
      [`merge command head ${input.command_head_sha} is not live head ${input.live_head_sha}`],
      "refresh the merge command against the current PR head before attempting merge",
    );
  }

  if (input.status_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_status_head",
      [`status head ${input.status_head_sha} is not live head ${input.live_head_sha}`],
      "read the current-head status surface before merge admission",
    );
  }

  if (input.status_verdict !== "passing" && input.status_verdict !== "passing_with_warnings") {
    return block(
      input,
      "block_status_not_passing",
      [`status verdict is ${input.status_verdict}`],
      "do not attempt merge until the live-head status surface is passing or passing with warnings only",
      [`status verdict ${input.status_verdict}`],
    );
  }

  if (input.review_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_review_head",
      [`review head ${input.review_head_sha} is not live head ${input.live_head_sha}`],
      "discard stale review responses and wait for live-head review authority",
    );
  }

  if (changeRequests.length > 0 || approvals.length < requiredApprovals) {
    return block(
      input,
      "block_review_not_approved",
      [
        ...changeRequests.map((reviewer) => `changes requested by ${reviewer}`),
        ...(approvals.length < requiredApprovals
          ? [`required approvals ${approvals.length}/${requiredApprovals} have surfaced on the live head`]
          : []),
      ],
      "route to review repair or wait for the missing live-head approval before merge admission",
      [...approvals.map((reviewer) => `approved by ${reviewer}`), ...changeRequests.map((reviewer) => `changes requested by ${reviewer}`)],
    );
  }

  if (input.mergeability_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_mergeability_not_current",
      [`mergeability head ${input.mergeability_head_sha} is not live head ${input.live_head_sha}`],
      "refresh PR mergeability after status and review authority converge on the live head",
    );
  }

  if (input.mergeable !== true) {
    return block(
      input,
      "block_mergeability_false",
      [`mergeable is ${input.mergeable === null ? "unknown" : "false"}`],
      "wait for GitHub mergeability to become true or route to the exact mergeability blocker",
      [`mergeable ${input.mergeable === null ? "unknown" : "false"}`],
    );
  }

  if (!attemptId || input.spent_attempt_ids.includes(attemptId)) {
    return block(
      input,
      "block_repeated_attempt",
      [attemptId ? `merge attempt id already spent: ${attemptId}` : "merge attempt id is missing"],
      "mint a new live-head merge attempt id before issuing the merge command",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_merge_attempt",
    decisive_evidence: [
      ...evidence(input),
      `status verdict ${input.status_verdict}`,
      ...approvals.map((reviewer) => `approved by ${reviewer}`),
      "mergeable true",
      `attempt ${attemptId}`,
    ],
    blockers: [],
    next_route: "issue the merge command only with expected_head_sha bound to this live head",
  };
}
