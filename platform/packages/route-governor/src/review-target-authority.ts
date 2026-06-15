import type { TerminalReviewHandoffVerdict } from "./terminal-review-handoff.js";

export type ReviewTargetAuthorityAction =
  | "admit_review_targets"
  | "emit_exact_review_target_blocker"
  | "block_unadmitted_handoff"
  | "block_stale_live_head"
  | "block_placeholder_targets"
  | "block_self_review_targets"
  | "block_replayed_target_set";

export interface ReviewTargetAuthorityInput {
  handoff: TerminalReviewHandoffVerdict;
  live_head_sha?: string;
  requested_reviewers: string[];
  requested_team_reviewers: string[];
  acting_user: string;
  pr_author: string;
  target_set_id: string;
  spent_target_set_ids: string[];
  exact_blocker?: string;
}

export interface ReviewTargetAuthorityVerdict {
  ok: boolean;
  action: ReviewTargetAuthorityAction;
  reviewers: string[];
  team_reviewers: string[];
  target_set_id: string | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const PLACEHOLDER_TARGETS = new Set([
  "platform-reviewer",
  "reviewer",
  "todo",
  "tbd",
  "example-reviewer",
  "placeholder-reviewer",
]);

function normalize(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function lowerSet(values: string[]): Set<string> {
  return new Set(values.map((value) => value.toLowerCase()));
}

function block(
  action: Exclude<ReviewTargetAuthorityAction, "admit_review_targets">,
  evidence: string[],
  blockers: string[],
  nextRoute: string,
): ReviewTargetAuthorityVerdict {
  return {
    ok: false,
    action,
    reviewers: [],
    team_reviewers: [],
    target_set_id: null,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

export function resolveReviewTargetAuthority(input: ReviewTargetAuthorityInput): ReviewTargetAuthorityVerdict {
  const evidence = [
    `handoff action ${input.handoff.action}`,
    `head ${input.handoff.head_sha}`,
    `branch ${input.handoff.branch}`,
    ...(input.live_head_sha ? [`live head ${input.live_head_sha}`] : []),
  ];

  if (!input.handoff.ok || input.handoff.action !== "admit_review_request") {
    return block(
      "block_unadmitted_handoff",
      evidence,
      [...input.handoff.blockers, `terminal handoff action is ${input.handoff.action}, not admit_review_request`],
      "admit terminal review handoff before resolving reviewer targets",
    );
  }

  if (input.live_head_sha && input.handoff.head_sha !== input.live_head_sha) {
    return block(
      "block_stale_live_head",
      evidence,
      [`review target handoff head ${input.handoff.head_sha} is not live head ${input.live_head_sha}`],
      "refresh terminal review handoff against the live PR head before resolving reviewer targets",
    );
  }

  const reviewers = normalize(input.requested_reviewers);
  const teamReviewers = normalize(input.requested_team_reviewers);
  const allTargets = [...reviewers, ...teamReviewers];
  const placeholders = allTargets.filter((target) => PLACEHOLDER_TARGETS.has(target.toLowerCase()));

  if (placeholders.length > 0) {
    return block(
      "block_placeholder_targets",
      evidence,
      placeholders.map((target) => `review target is a placeholder: ${target}`),
      "replace placeholder review targets with real GitHub reviewer or team slugs",
    );
  }

  if (allTargets.length === 0) {
    const blocker = input.exact_blocker?.trim();
    if (blocker) {
      return block(
        "emit_exact_review_target_blocker",
        [...evidence, blocker],
        [blocker],
        "obtain a real reviewer or team slug before issuing a GitHub review request",
      );
    }

    return block(
      "emit_exact_review_target_blocker",
      evidence,
      ["no real reviewer or team reviewer target is available for the admitted review request"],
      "obtain a real reviewer or team slug before issuing a GitHub review request",
    );
  }

  const reviewerSet = lowerSet(reviewers);
  const selfTargets = [input.acting_user, input.pr_author]
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => reviewerSet.has(value.toLowerCase()));

  if (selfTargets.length > 0) {
    return block(
      "block_self_review_targets",
      evidence,
      [...new Set(selfTargets)].map((target) => `reviewer target cannot be the acting user or PR author: ${target}`),
      "name an independent reviewer or team before issuing the GitHub review request",
    );
  }

  if (!input.target_set_id.trim() || input.spent_target_set_ids.includes(input.target_set_id)) {
    return block(
      "block_replayed_target_set",
      evidence,
      [input.target_set_id.trim() ? `review target set already spent: ${input.target_set_id}` : "review target set has no id"],
      "compile review targets with a new durable target-set id",
    );
  }

  return {
    ok: true,
    action: "admit_review_targets",
    reviewers,
    team_reviewers: teamReviewers,
    target_set_id: input.target_set_id,
    decisive_evidence: [
      ...evidence,
      input.target_set_id,
      ...reviewers.map((reviewer) => `reviewer:${reviewer}`),
      ...teamReviewers.map((team) => `team:${team}`),
    ],
    blockers: [],
    next_route: "compile the GitHub review request command only with this admitted target set and live-head guard",
  };
}
