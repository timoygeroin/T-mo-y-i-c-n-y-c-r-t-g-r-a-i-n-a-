export type BranchProtectionReviewState = "approved" | "changes_requested" | "commented" | "pending";

export type BranchProtectionStatusState = "success" | "neutral" | "pending" | "failure" | "missing";

export type BranchProtectionReadinessAction =
  | "branch_protection_ready"
  | "route_to_required_status_readback"
  | "route_to_required_review"
  | "route_to_review_repair"
  | "block_branch_mismatch"
  | "block_stale_evidence_head"
  | "block_missing_rule_source";

export interface BranchProtectionRuleSource {
  source_id: string;
  branch: string;
  require_status_contexts: string[];
  required_approving_review_count: number;
  evidence: string[];
}

export interface BranchProtectionStatusEvidence {
  context: string;
  head_sha: string;
  state: BranchProtectionStatusState;
  evidence: string[];
}

export interface BranchProtectionReviewEvidence {
  reviewer: string;
  head_sha: string;
  state: BranchProtectionReviewState;
  evidence: string[];
}

export interface BranchProtectionReadinessInput {
  active_branch: string;
  live_head_sha: string;
  rule_source?: BranchProtectionRuleSource;
  statuses: BranchProtectionStatusEvidence[];
  reviews: BranchProtectionReviewEvidence[];
}

export interface BranchProtectionReadinessVerdict {
  ok: boolean;
  action: BranchProtectionReadinessAction;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function block(
  input: BranchProtectionReadinessInput,
  action: Exclude<BranchProtectionReadinessAction, "branch_protection_ready">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): BranchProtectionReadinessVerdict {
  return {
    ok: false,
    action,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function liveStatuses(input: BranchProtectionReadinessInput): BranchProtectionStatusEvidence[] {
  return input.statuses.filter((status) => status.head_sha === input.live_head_sha);
}

function liveReviews(input: BranchProtectionReadinessInput): BranchProtectionReviewEvidence[] {
  return input.reviews.filter((review) => review.head_sha === input.live_head_sha);
}

function staleEvidenceBlockers(input: BranchProtectionReadinessInput): string[] {
  const staleStatuses = input.statuses.filter((status) => status.head_sha !== input.live_head_sha);
  const staleReviews = input.reviews.filter((review) => review.head_sha !== input.live_head_sha);

  return [
    ...staleStatuses.map((status) => `status ${status.context} belongs to ${status.head_sha}`),
    ...staleReviews.map((review) => `review by ${review.reviewer} belongs to ${review.head_sha}`),
  ];
}

export function compileBranchProtectionReadiness(
  input: BranchProtectionReadinessInput,
): BranchProtectionReadinessVerdict {
  const rule = input.rule_source;
  if (!rule) {
    return block(
      input,
      "block_missing_rule_source",
      ["no branch-protection rule source is attached"],
      "read branch protection, repository ruleset, or an explicit configured rule before claiming branch-protection readiness",
    );
  }

  if (rule.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`rule source ${rule.source_id} belongs to branch ${rule.branch}`],
      "bind branch-protection readiness to the active manifestation branch",
      rule.evidence,
    );
  }

  const stale = staleEvidenceBlockers(input);
  if (stale.length > 0) {
    return block(
      input,
      "block_stale_evidence_head",
      stale,
      "discard stale review/status evidence and read branch-protection evidence for the live PR head",
      stale,
    );
  }

  const requiredContexts = unique(rule.require_status_contexts);
  const statusByContext = new Map(liveStatuses(input).map((status) => [normalize(status.context), status]));
  const missingOrBadStatuses = requiredContexts.filter((context) => {
    const status = statusByContext.get(normalize(context));
    return !status || (status.state !== "success" && status.state !== "neutral");
  });

  if (missingOrBadStatuses.length > 0) {
    return block(
      input,
      "route_to_required_status_readback",
      missingOrBadStatuses.map((context) => `required status context is not passing on live head: ${context}`),
      "read or repair required branch-protection status contexts before review handoff or merge",
      missingOrBadStatuses,
    );
  }

  const liveReviewEvidence = liveReviews(input);
  const changeRequests = liveReviewEvidence.filter((review) => review.state === "changes_requested");
  if (changeRequests.length > 0) {
    return block(
      input,
      "route_to_review_repair",
      changeRequests.map((review) => `changes requested by ${review.reviewer}`),
      "repair live-head review requests before claiming branch-protection readiness",
      changeRequests.flatMap((review) => review.evidence),
    );
  }

  const approvals = unique(
    liveReviewEvidence.filter((review) => review.state === "approved").map((review) => normalize(review.reviewer)),
  );
  if (approvals.length < rule.required_approving_review_count) {
    return block(
      input,
      "route_to_required_review",
      [
        `required approvals ${rule.required_approving_review_count}; live-head approvals ${approvals.length}`,
      ],
      "request or wait for required approving reviews before merge handoff",
      approvals.map((reviewer) => `approval:${reviewer}`),
    );
  }

  return {
    ok: true,
    action: "branch_protection_ready",
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    decisive_evidence: [
      `rule source ${rule.source_id}`,
      ...rule.evidence,
      ...requiredContexts.map((context) => `required status passed:${context}`),
      ...approvals.map((reviewer) => `required approval:${reviewer}`),
    ],
    blockers: [],
    next_route: "allow terminal review or merge handoff only while branch-protection evidence remains bound to this live head",
  };
}
