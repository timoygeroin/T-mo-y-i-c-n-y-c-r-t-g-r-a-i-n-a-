export type ReviewHandoffStatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "no_status_surface";

export type ReviewHandoffRequestedAction =
  | "request_review"
  | "merge"
  | "read_status"
  | "metadata_reread"
  | "duplicate_comment"
  | "duplicate_label"
  | "local_memory_guard";

export type ReviewHandoffAction =
  | "admit_review_request"
  | "admit_merge_handoff"
  | "block_branch_or_head_mismatch"
  | "block_unready_pr"
  | "block_unstable_status"
  | "block_non_progress_action"
  | "block_missing_review_target"
  | "block_missing_merge_authority";

export interface ReviewHandoffInput {
  repository_full_name: string;
  pr_number: number;
  active_branch: string;
  live_head_sha: string;
  target_branch: string;
  target_head_sha: string;
  pr_state: "open" | "closed";
  draft: boolean;
  mergeable: boolean | null;
  status_verdict: ReviewHandoffStatusVerdict;
  blocking_failures: string[];
  pending_surfaces: string[];
  non_blocking_warnings: string[];
  requested_action: ReviewHandoffRequestedAction;
  requested_reviewers: string[];
  merge_authority_confirmed: boolean;
  spent_actions: ReviewHandoffRequestedAction[];
}

export interface ReviewHandoffVerdict {
  ok: boolean;
  action: ReviewHandoffAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

const NON_PROGRESS_ACTIONS = new Set<ReviewHandoffRequestedAction>([
  "read_status",
  "metadata_reread",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
]);

function base(input: ReviewHandoffInput): Pick<
  ReviewHandoffVerdict,
  "repository_full_name" | "pr_number" | "branch" | "head_sha" | "warnings"
> {
  return {
    repository_full_name: input.repository_full_name,
    pr_number: input.pr_number,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    warnings: input.non_blocking_warnings,
  };
}

function block(
  input: ReviewHandoffInput,
  action: Exclude<ReviewHandoffAction, "admit_review_request" | "admit_merge_handoff">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ReviewHandoffVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function stableStatusBlockers(input: ReviewHandoffInput): string[] {
  if (input.status_verdict === "failing") {
    return input.blocking_failures.length > 0 ? input.blocking_failures : ["live-head status is failing"];
  }
  if (input.status_verdict === "pending") {
    return input.pending_surfaces.length > 0 ? input.pending_surfaces : ["live-head status is pending"];
  }
  if (input.status_verdict === "no_status_surface") {
    return ["no live-head status surface is attached to review handoff"];
  }
  return [];
}

export function routeReviewHandoff(input: ReviewHandoffInput): ReviewHandoffVerdict {
  if (input.active_branch !== input.target_branch || input.live_head_sha !== input.target_head_sha) {
    return block(
      input,
      "block_branch_or_head_mismatch",
      [
        ...(input.active_branch !== input.target_branch
          ? [`active branch ${input.active_branch} does not match target branch ${input.target_branch}`]
          : []),
        ...(input.live_head_sha !== input.target_head_sha
          ? [`live head ${input.live_head_sha} does not match target head ${input.target_head_sha}`]
          : []),
      ],
      "rebind review handoff to the current PR branch and live head before advancing",
    );
  }

  if (input.pr_state !== "open" || input.draft) {
    return block(
      input,
      "block_unready_pr",
      [
        ...(input.pr_state !== "open" ? [`PR #${input.pr_number} is ${input.pr_state}`] : []),
        ...(input.draft ? [`PR #${input.pr_number} is still draft`] : []),
      ],
      "make the PR open and ready for review before handoff",
    );
  }

  if (NON_PROGRESS_ACTIONS.has(input.requested_action) || input.spent_actions.includes(input.requested_action)) {
    return block(
      input,
      "block_non_progress_action",
      [
        ...(NON_PROGRESS_ACTIONS.has(input.requested_action)
          ? [`review handoff requested non-progress action: ${input.requested_action}`]
          : []),
        ...(input.spent_actions.includes(input.requested_action)
          ? [`review handoff action already spent: ${input.requested_action}`]
          : []),
      ],
      "choose review request or merge handoff after live-head readiness is grounded",
      [input.requested_action],
    );
  }

  const statusBlockers = stableStatusBlockers(input);
  if (statusBlockers.length > 0) {
    return block(
      input,
      "block_unstable_status",
      statusBlockers,
      "repair or wait for the live-head status surface before review handoff",
    );
  }

  const evidence = [
    `target ${input.repository_full_name}#${input.pr_number}`,
    `${input.active_branch}@${input.live_head_sha}`,
    `status ${input.status_verdict}`,
    ...input.non_blocking_warnings.map((warning) => `non-blocking warning: ${warning}`),
  ];

  if (input.requested_action === "request_review") {
    if (input.requested_reviewers.length === 0) {
      return block(
        input,
        "block_missing_review_target",
        ["review request has no requested reviewer"],
        "supply at least one reviewer before requesting review",
        evidence,
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_review_request",
      decisive_evidence: [...evidence, ...input.requested_reviewers.map((reviewer) => `reviewer ${reviewer}`)],
      blockers: [],
      next_route: "request review on the current live head; do not publish another status summary first",
    };
  }

  if (input.requested_action === "merge") {
    if (input.mergeable !== true) {
      return block(
        input,
        "block_unready_pr",
        [`PR #${input.pr_number} mergeable is ${String(input.mergeable)}`],
        "wait for GitHub mergeability to resolve true before merge handoff",
        evidence,
      );
    }
    if (!input.merge_authority_confirmed) {
      return block(
        input,
        "block_missing_merge_authority",
        ["merge handoff lacks explicit merge authority"],
        "obtain explicit merge authority before merging the current live head",
        evidence,
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_merge_handoff",
      decisive_evidence: [...evidence, "mergeable true", "merge authority confirmed"],
      blockers: [],
      next_route: "merge only with expected-head protection against the admitted live head",
    };
  }

  return block(
    input,
    "block_non_progress_action",
    [`review handoff action is not admitted: ${input.requested_action}`],
    "choose review request or merge handoff after live-head readiness is grounded",
  );
}
