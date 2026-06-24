export type PrBodyHeadClaimKind =
  | "current_head"
  | "repaired_head"
  | "status_readback_head"
  | "blocker_head";

export type PrBodyHeadClaimVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "resolved" | "unknown";

export type PrBodyHeadDriftAction =
  | "accept_pr_body_live_head_context"
  | "quarantine_pr_body_head_summary"
  | "block_branch_mismatch";

export interface PrBodyHeadClaim {
  claim_id: string;
  kind: PrBodyHeadClaimKind;
  head_sha: string;
  verdict?: PrBodyHeadClaimVerdict;
  evidence: string;
}

export interface PrBodyHeadDriftBoundaryInput {
  active_branch: string;
  live_pr_branch: string;
  live_pr_head_sha: string;
  resolved_repaired_head_sha?: string;
  repaired_head_status_resolved: boolean;
  blocker_issue_closed: boolean;
  blocker_label_present: boolean;
  pr_body_claims: PrBodyHeadClaim[];
}

export interface PrBodyHeadDriftBoundaryVerdict {
  ok: boolean;
  action: PrBodyHeadDriftAction;
  branch: string;
  head_sha: string;
  live_claim_ids: string[];
  quarantined_claim_ids: string[];
  historical_claim_ids: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function isResolvedHistoricalClaim(input: PrBodyHeadDriftBoundaryInput, claim: PrBodyHeadClaim): boolean {
  return (
    Boolean(input.resolved_repaired_head_sha) &&
    claim.head_sha === input.resolved_repaired_head_sha &&
    input.repaired_head_status_resolved &&
    input.blocker_issue_closed &&
    !input.blocker_label_present &&
    (claim.kind === "repaired_head" || claim.kind === "status_readback_head")
  );
}

function isLiveClaim(input: PrBodyHeadDriftBoundaryInput, claim: PrBodyHeadClaim): boolean {
  return claim.head_sha === input.live_pr_head_sha && claim.kind === "current_head";
}

function claimLabel(claim: PrBodyHeadClaim): string {
  return `${claim.claim_id}:${claim.kind}@${claim.head_sha}`;
}

export function compilePrBodyHeadDriftBoundary(
  input: PrBodyHeadDriftBoundaryInput,
): PrBodyHeadDriftBoundaryVerdict {
  const base = {
    branch: input.live_pr_branch,
    head_sha: input.live_pr_head_sha,
  };

  if (input.live_pr_branch !== input.active_branch) {
    return {
      ...base,
      ok: false,
      action: "block_branch_mismatch",
      live_claim_ids: [],
      quarantined_claim_ids: [],
      historical_claim_ids: [],
      decisive_evidence: [],
      blockers: [`PR body belongs to branch ${input.live_pr_branch}, not active branch ${input.active_branch}`],
      next_route: "rebind PR-body head drift checks to the active manifestation branch before release",
    };
  }

  const liveClaims = input.pr_body_claims.filter((claim) => isLiveClaim(input, claim));
  const historicalClaims = input.pr_body_claims.filter((claim) => isResolvedHistoricalClaim(input, claim));
  const quarantinedClaims = input.pr_body_claims.filter(
    (claim) => !isLiveClaim(input, claim) && !isResolvedHistoricalClaim(input, claim),
  );

  if (quarantinedClaims.length > 0) {
    return {
      ...base,
      ok: true,
      action: "quarantine_pr_body_head_summary",
      live_claim_ids: liveClaims.map((claim) => claim.claim_id),
      quarantined_claim_ids: quarantinedClaims.map((claim) => claim.claim_id),
      historical_claim_ids: historicalClaims.map((claim) => claim.claim_id),
      decisive_evidence: [
        `live PR head ${input.live_pr_head_sha}`,
        ...quarantinedClaims.map((claim) => `quarantine ${claimLabel(claim)}`),
        ...historicalClaims.map((claim) => `preserve historical ${claimLabel(claim)}`),
      ],
      blockers: [],
      next_route:
        "treat quarantined PR-body head claims as summary residue; continue only from the live PR head or a direct head-bound status surface",
    };
  }

  return {
    ...base,
    ok: true,
    action: "accept_pr_body_live_head_context",
    live_claim_ids: liveClaims.map((claim) => claim.claim_id),
    quarantined_claim_ids: [],
    historical_claim_ids: historicalClaims.map((claim) => claim.claim_id),
    decisive_evidence: [
      `live PR head ${input.live_pr_head_sha}`,
      ...liveClaims.map((claim) => `live ${claimLabel(claim)}`),
      ...historicalClaims.map((claim) => `historical ${claimLabel(claim)}`),
    ],
    blockers: [],
    next_route: "use PR body only as live-head context; require direct status evidence before status claims",
  };
}
