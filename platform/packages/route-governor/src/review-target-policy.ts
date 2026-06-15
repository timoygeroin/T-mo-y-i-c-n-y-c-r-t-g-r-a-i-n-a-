export type ReviewTargetPolicyAction =
  | "admit_external_review_targets"
  | "block_missing_review_targets"
  | "block_placeholder_review_targets"
  | "block_author_self_review"
  | "block_repeated_target_set"
  | "block_stale_command_head";

export interface ReviewTargetPolicyInput {
  repository_full_name: string;
  pr_number: number;
  branch: string;
  live_head_sha: string;
  command_head_sha: string;
  pr_author: string;
  requested_reviewers: string[];
  requested_team_reviewers: string[];
  spent_target_sets: string[];
}

export interface ReviewTargetPolicyVerdict {
  ok: boolean;
  action: ReviewTargetPolicyAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  reviewers: string[];
  team_reviewers: string[];
  target_set_id: string | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const PLACEHOLDER_REVIEW_TARGETS = new Set([
  "platform-reviewer",
  "reviewer",
  "todo",
  "tbd",
  "example-reviewer",
  "placeholder-reviewer",
]);

function normalizeTargets(targets: string[]): string[] {
  return [...new Set(targets.map((target) => target.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function normalizedLogin(login: string): string {
  return login.trim().toLowerCase();
}

function targetSetId(branch: string, headSha: string, reviewers: string[], teams: string[]): string {
  const reviewerKey = reviewers.map((reviewer) => `user:${normalizedLogin(reviewer)}`).join(",");
  const teamKey = teams.map((team) => `team:${normalizedLogin(team)}`).join(",");
  return `${branch}@${headSha}|${reviewerKey}|${teamKey}`;
}

function base(
  input: ReviewTargetPolicyInput,
  reviewers: string[],
  teamReviewers: string[],
  targetId: string | null,
): Pick<
  ReviewTargetPolicyVerdict,
  "repository_full_name" | "pr_number" | "branch" | "head_sha" | "reviewers" | "team_reviewers" | "target_set_id"
> {
  return {
    repository_full_name: input.repository_full_name,
    pr_number: input.pr_number,
    branch: input.branch,
    head_sha: input.live_head_sha,
    reviewers,
    team_reviewers: teamReviewers,
    target_set_id: targetId,
  };
}

function block(
  input: ReviewTargetPolicyInput,
  action: Exclude<ReviewTargetPolicyAction, "admit_external_review_targets">,
  reviewers: string[],
  teamReviewers: string[],
  targetId: string | null,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ReviewTargetPolicyVerdict {
  return {
    ...base(input, reviewers, teamReviewers, targetId),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

export function enforceReviewTargetPolicy(input: ReviewTargetPolicyInput): ReviewTargetPolicyVerdict {
  const reviewers = normalizeTargets(input.requested_reviewers);
  const teamReviewers = normalizeTargets(input.requested_team_reviewers);
  const targetId = reviewers.length > 0 || teamReviewers.length > 0
    ? targetSetId(input.branch, input.live_head_sha, reviewers, teamReviewers)
    : null;
  const evidence = [
    `live head ${input.live_head_sha}`,
    `command head ${input.command_head_sha}`,
    `pr author ${input.pr_author}`,
  ];

  if (input.command_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_command_head",
      reviewers,
      teamReviewers,
      targetId,
      [`review target command head ${input.command_head_sha} is not live head ${input.live_head_sha}`],
      "refresh the review command against the live PR head before selecting targets",
      evidence,
    );
  }

  if (reviewers.length === 0 && teamReviewers.length === 0) {
    return block(
      input,
      "block_missing_review_targets",
      reviewers,
      teamReviewers,
      targetId,
      ["review target policy received no reviewer or team target"],
      "supply at least one real external reviewer or team target, or emit the exact reviewer-target blocker",
      evidence,
    );
  }

  const placeholders = [...reviewers, ...teamReviewers].filter((target) =>
    PLACEHOLDER_REVIEW_TARGETS.has(normalizedLogin(target)),
  );
  if (placeholders.length > 0) {
    return block(
      input,
      "block_placeholder_review_targets",
      reviewers,
      teamReviewers,
      targetId,
      placeholders.map((target) => `review target is a placeholder: ${target}`),
      "replace placeholder review targets with real GitHub users or team slugs",
      evidence,
    );
  }

  const author = normalizedLogin(input.pr_author);
  const selfReviewers = reviewers.filter((reviewer) => normalizedLogin(reviewer) === author);
  if (selfReviewers.length > 0) {
    return block(
      input,
      "block_author_self_review",
      reviewers,
      teamReviewers,
      targetId,
      selfReviewers.map((reviewer) => `review target is the PR author: ${reviewer}`),
      "choose an external reviewer target before issuing the GitHub review request command",
      evidence,
    );
  }

  if (targetId && input.spent_target_sets.includes(targetId)) {
    return block(
      input,
      "block_repeated_target_set",
      reviewers,
      teamReviewers,
      targetId,
      [`review target set already spent: ${targetId}`],
      "do not reissue the same reviewer target set for the same live head",
      evidence,
    );
  }

  return {
    ...base(input, reviewers, teamReviewers, targetId),
    ok: true,
    action: "admit_external_review_targets",
    decisive_evidence: [
      ...evidence,
      targetId ?? "target-set:<none>",
      ...reviewers.map((reviewer) => `reviewer:${reviewer}`),
      ...teamReviewers.map((team) => `team:${team}`),
    ],
    blockers: [],
    next_route: "compile the GitHub review request command only with these admitted external targets and this live head",
  };
}
