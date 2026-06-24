import type { TerminalReviewHandoffVerdict } from "./terminal-review-handoff.js";

export type ReviewRequestCommandAction =
  | "compile_review_request_command"
  | "block_unadmitted_handoff"
  | "block_stale_handoff_head"
  | "block_missing_review_target"
  | "block_placeholder_review_target"
  | "block_repeated_command"
  | "block_external_boundary";

export interface ReviewRequestCommandInput {
  handoff: TerminalReviewHandoffVerdict;
  live_head_sha: string;
  requested_reviewers: string[];
  requested_team_reviewers: string[];
  command_id: string;
  spent_command_ids: string[];
  external_boundary: "github_pull_request_review_request" | "comment" | "status_readback" | "local_memory";
}

export interface ReviewRequestCommand {
  command_id: string;
  operation: "request_pull_request_reviewers";
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  reviewers: string[];
  team_reviewers: string[];
  guard: {
    require_live_head_sha: string;
    forbidden_fallbacks: string[];
  };
}

export interface ReviewRequestCommandVerdict {
  ok: boolean;
  action: ReviewRequestCommandAction;
  command: ReviewRequestCommand | null;
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
  return [...new Set(targets.map((target) => target.trim()).filter(Boolean))].sort();
}

function placeholderTargets(targets: string[]): string[] {
  return targets.filter((target) => PLACEHOLDER_REVIEW_TARGETS.has(target.toLowerCase()));
}

function block(
  action: Exclude<ReviewRequestCommandAction, "compile_review_request_command">,
  decisiveEvidence: string[],
  blockers: string[],
  nextRoute: string,
): ReviewRequestCommandVerdict {
  return {
    ok: false,
    action,
    command: null,
    decisive_evidence: decisiveEvidence,
    blockers,
    next_route: nextRoute,
  };
}

export function compileReviewRequestCommand(input: ReviewRequestCommandInput): ReviewRequestCommandVerdict {
  const evidence = [
    `handoff action ${input.handoff.action}`,
    `handoff head ${input.handoff.head_sha}`,
    `live head ${input.live_head_sha}`,
    `branch ${input.handoff.branch}`,
  ];

  if (input.external_boundary !== "github_pull_request_review_request") {
    return block(
      "block_external_boundary",
      evidence,
      [`review request command cannot be released through ${input.external_boundary}`],
      "use the GitHub pull-request reviewer-request boundary, or emit the exact external blocker",
    );
  }

  if (!input.handoff.ok || input.handoff.action !== "admit_review_request") {
    return block(
      "block_unadmitted_handoff",
      evidence,
      [
        ...input.handoff.blockers,
        `terminal handoff action is ${input.handoff.action}, not admit_review_request`,
      ],
      "resolve terminal handoff blockers before compiling a review request command",
    );
  }

  if (input.handoff.head_sha !== input.live_head_sha) {
    return block(
      "block_stale_handoff_head",
      evidence,
      [`terminal handoff head ${input.handoff.head_sha} is not live head ${input.live_head_sha}`],
      "refresh terminal handoff against the live PR head before compiling a review request command",
    );
  }

  const reviewers = normalizeTargets(input.requested_reviewers);
  const teamReviewers = normalizeTargets(input.requested_team_reviewers);
  const placeholders = placeholderTargets([...reviewers, ...teamReviewers]);

  if (reviewers.length === 0 && teamReviewers.length === 0) {
    return block(
      "block_missing_review_target",
      evidence,
      ["review request command has no reviewer or team reviewer target"],
      "name an external reviewer target before issuing the GitHub review request command",
    );
  }

  if (placeholders.length > 0) {
    return block(
      "block_placeholder_review_target",
      evidence,
      placeholders.map((target) => `review request target is a placeholder: ${target}`),
      "replace placeholder review targets with real GitHub reviewer or team slugs before issuing the command",
    );
  }

  if (!input.command_id.trim()) {
    return block(
      "block_repeated_command",
      evidence,
      ["review request command has no command id"],
      "compile review request commands with a durable command id",
    );
  }

  if (input.spent_command_ids.includes(input.command_id)) {
    return block(
      "block_repeated_command",
      evidence,
      [`review request command already spent: ${input.command_id}`],
      "do not reissue an already spent review request command",
    );
  }

  const command: ReviewRequestCommand = {
    command_id: input.command_id,
    operation: "request_pull_request_reviewers",
    repository_full_name: input.handoff.repository_full_name,
    pr_number: input.handoff.pr_number,
    branch: input.handoff.branch,
    head_sha: input.handoff.head_sha,
    reviewers,
    team_reviewers: teamReviewers,
    guard: {
      require_live_head_sha: input.live_head_sha,
      forbidden_fallbacks: [
        "duplicate_comment",
        "metadata_reread",
        "stale_repaired_head_status",
        "stale_terminal_handoff",
        "local_memory_guard",
      ],
    },
  };

  return {
    ok: true,
    action: "compile_review_request_command",
    command,
    decisive_evidence: [
      ...evidence,
      input.command_id,
      ...reviewers.map((reviewer) => `reviewer:${reviewer}`),
      ...teamReviewers.map((team) => `team:${team}`),
      ...input.handoff.decisive_evidence,
    ],
    blockers: [],
    next_route: "issue the compiled GitHub reviewer request only if the PR head still matches the command guard",
  };
}
