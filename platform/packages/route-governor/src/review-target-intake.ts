export type ReviewTargetIntakeAction =
  | "admit_external_review_targets"
  | "block_missing_review_targets"
  | "block_placeholder_review_targets"
  | "block_self_only_review_targets"
  | "block_spent_target_intake";

export interface ReviewTargetIntakeInput {
  intake_id: string;
  repository_owner: string;
  pr_author: string;
  candidate_reviewers: string[];
  candidate_team_reviewers: string[];
  placeholder_targets: string[];
  spent_intake_ids: string[];
}

export interface ReviewTargetIntakeVerdict {
  ok: boolean;
  action: ReviewTargetIntakeAction;
  intake_id: string | null;
  reviewers: string[];
  team_reviewers: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function normalize(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function lowerSet(values: string[]): Set<string> {
  return new Set(values.map((value) => value.toLowerCase()));
}

function block(
  input: ReviewTargetIntakeInput,
  action: Exclude<ReviewTargetIntakeAction, "admit_external_review_targets">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ReviewTargetIntakeVerdict {
  return {
    ok: false,
    action,
    intake_id: null,
    reviewers: [],
    team_reviewers: [],
    decisive_evidence: [
      `repository owner ${input.repository_owner}`,
      `pr author ${input.pr_author}`,
      ...evidence,
    ],
    blockers,
    next_route: nextRoute,
  };
}

export function intakeReviewTargets(input: ReviewTargetIntakeInput): ReviewTargetIntakeVerdict {
  const intakeId = input.intake_id.trim();
  if (!intakeId || input.spent_intake_ids.includes(intakeId)) {
    return block(
      input,
      "block_spent_target_intake",
      [intakeId ? `review target intake already spent: ${intakeId}` : "review target intake has no id"],
      "compile each review-target intake with a fresh durable id before issuing a reviewer request",
    );
  }

  const reviewers = normalize(input.candidate_reviewers);
  const teamReviewers = normalize(input.candidate_team_reviewers);

  if (reviewers.length === 0 && teamReviewers.length === 0) {
    return block(
      input,
      "block_missing_review_targets",
      ["review target intake has no reviewer or team reviewer target"],
      "obtain a concrete external reviewer target or emit the exact review-target blocker",
    );
  }

  const placeholderLookup = lowerSet(input.placeholder_targets);
  const placeholders = [...reviewers, ...teamReviewers].filter((target) =>
    placeholderLookup.has(target.toLowerCase()),
  );
  if (placeholders.length > 0) {
    return block(
      input,
      "block_placeholder_review_targets",
      placeholders.map((target) => `review target is a placeholder: ${target}`),
      "replace placeholder review targets with real GitHub usernames or team slugs",
      placeholders,
    );
  }

  const selfTargets = lowerSet([input.repository_owner, input.pr_author]);
  const externalReviewers = reviewers.filter((reviewer) => !selfTargets.has(reviewer.toLowerCase()));
  if (externalReviewers.length === 0 && teamReviewers.length === 0) {
    return block(
      input,
      "block_self_only_review_targets",
      reviewers.map((reviewer) => `review target is self-only: ${reviewer}`),
      "supply a reviewer outside the repository owner/PR author boundary, a team target, or emit the exact external blocker",
      reviewers,
    );
  }

  return {
    ok: true,
    action: "admit_external_review_targets",
    intake_id: intakeId,
    reviewers,
    team_reviewers: teamReviewers,
    decisive_evidence: [
      `intake ${intakeId}`,
      ...externalReviewers.map((reviewer) => `external reviewer:${reviewer}`),
      ...teamReviewers.map((team) => `team:${team}`),
    ],
    blockers: [],
    next_route: "pass admitted targets into compileReviewRequestCommand only while the PR head guard still matches",
  };
}
