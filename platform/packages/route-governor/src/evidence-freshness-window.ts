export type EvidenceFreshnessSource =
  | "github_pr_metadata"
  | "github_check_run"
  | "github_workflow_run"
  | "github_combined_status"
  | "pr_body_text"
  | "prompt_text"
  | "memory_receipt"
  | "branch_write_receipt";

export type EvidenceFreshnessPurpose =
  | "live_head_context"
  | "status_authority"
  | "external_write_receipt"
  | "review_or_merge_authority"
  | "routing_context";

export type EvidenceFreshnessAction =
  | "accept_current_status_authority"
  | "accept_current_write_receipt"
  | "accept_current_head_context"
  | "block_missing_live_head"
  | "block_stale_head"
  | "block_stale_observation"
  | "block_summary_as_status_authority"
  | "block_no_decisive_evidence";

export interface EvidenceFreshnessClaim {
  claim_id: string;
  source: EvidenceFreshnessSource;
  purpose: EvidenceFreshnessPurpose;
  bound_head_sha: string;
  observed_at: string;
  evidence: string[];
}

export interface EvidenceFreshnessWindowInput {
  branch: string;
  live_head_sha: string;
  live_head_observed_at: string;
  claims: EvidenceFreshnessClaim[];
  require_status_authority?: boolean;
}

export interface EvidenceFreshnessWindowVerdict {
  ok: boolean;
  action: EvidenceFreshnessAction;
  branch: string;
  live_head_sha: string;
  accepted_claim_ids: string[];
  rejected_claim_ids: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const STATUS_AUTHORITY_SOURCES = new Set<EvidenceFreshnessSource>([
  "github_check_run",
  "github_workflow_run",
  "github_combined_status",
]);

const SUMMARY_SOURCES = new Set<EvidenceFreshnessSource>(["pr_body_text", "prompt_text", "memory_receipt"]);

function observedMillis(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function decisiveEvidence(claims: EvidenceFreshnessClaim[]): string[] {
  return claims.flatMap((claim) => [claim.claim_id, ...claim.evidence]);
}

export function compileEvidenceFreshnessWindow(
  input: EvidenceFreshnessWindowInput,
): EvidenceFreshnessWindowVerdict {
  const base = {
    branch: input.branch,
    live_head_sha: input.live_head_sha,
  };

  if (!input.live_head_sha.trim()) {
    return {
      ...base,
      ok: false,
      action: "block_missing_live_head",
      accepted_claim_ids: [],
      rejected_claim_ids: input.claims.map((claim) => claim.claim_id),
      decisive_evidence: [],
      blockers: ["evidence freshness window has no live PR head"],
      next_route: "read the live PR head before accepting any carried authority",
    };
  }

  const liveObservedAt = observedMillis(input.live_head_observed_at);
  const accepted: EvidenceFreshnessClaim[] = [];
  const rejected: string[] = [];
  const blockers: string[] = [];

  for (const claim of input.claims) {
    const claimObservedAt = observedMillis(claim.observed_at);

    if (claim.bound_head_sha !== input.live_head_sha) {
      rejected.push(claim.claim_id);
      blockers.push(`claim ${claim.claim_id} is bound to ${claim.bound_head_sha}, not live head ${input.live_head_sha}`);
      continue;
    }

    if (liveObservedAt !== null && claimObservedAt !== null && claimObservedAt < liveObservedAt) {
      rejected.push(claim.claim_id);
      blockers.push(`claim ${claim.claim_id} was observed before the live head readback`);
      continue;
    }

    if (
      SUMMARY_SOURCES.has(claim.source) &&
      (claim.purpose === "status_authority" || claim.purpose === "review_or_merge_authority")
    ) {
      rejected.push(claim.claim_id);
      blockers.push(`claim ${claim.claim_id} comes from ${claim.source}, which cannot carry status or review authority`);
      continue;
    }

    accepted.push(claim);
  }

  const statusClaims = accepted.filter(
    (claim) => claim.purpose === "status_authority" && STATUS_AUTHORITY_SOURCES.has(claim.source),
  );

  if (statusClaims.length > 0) {
    return {
      ...base,
      ok: true,
      action: "accept_current_status_authority",
      accepted_claim_ids: accepted.map((claim) => claim.claim_id),
      rejected_claim_ids: rejected,
      decisive_evidence: decisiveEvidence(statusClaims),
      blockers,
      next_route: "route review, merge, or next embodiment only through current-head status authority",
    };
  }

  if (input.require_status_authority) {
    return {
      ...base,
      ok: false,
      action: blockers.some((blocker) => blocker.includes("cannot carry status"))
        ? "block_summary_as_status_authority"
        : blockers.some((blocker) => blocker.includes("observed before"))
          ? "block_stale_observation"
          : blockers.some((blocker) => blocker.includes("not live head"))
            ? "block_stale_head"
            : "block_no_decisive_evidence",
      accepted_claim_ids: accepted.map((claim) => claim.claim_id),
      rejected_claim_ids: rejected,
      decisive_evidence: decisiveEvidence(accepted),
      blockers: blockers.length > 0 ? blockers : ["no current-head status authority survived freshness filtering"],
      next_route: "obtain current-head check, workflow, or combined-status evidence before making a status claim",
    };
  }

  const writeClaims = accepted.filter((claim) => claim.purpose === "external_write_receipt");
  if (writeClaims.length > 0) {
    return {
      ...base,
      ok: true,
      action: "accept_current_write_receipt",
      accepted_claim_ids: accepted.map((claim) => claim.claim_id),
      rejected_claim_ids: rejected,
      decisive_evidence: decisiveEvidence(writeClaims),
      blockers,
      next_route: "after accepting the write receipt, require fresh status authority for the moved live head",
    };
  }

  const contextClaims = accepted.filter(
    (claim) => claim.purpose === "live_head_context" || claim.purpose === "routing_context",
  );
  if (contextClaims.length > 0) {
    return {
      ...base,
      ok: true,
      action: "accept_current_head_context",
      accepted_claim_ids: accepted.map((claim) => claim.claim_id),
      rejected_claim_ids: rejected,
      decisive_evidence: decisiveEvidence(contextClaims),
      blockers,
      next_route: "use the live-head context for routing, but do not treat it as status authority",
    };
  }

  return {
    ...base,
    ok: false,
    action: blockers.some((blocker) => blocker.includes("observed before"))
      ? "block_stale_observation"
      : blockers.some((blocker) => blocker.includes("not live head"))
        ? "block_stale_head"
        : "block_no_decisive_evidence",
    accepted_claim_ids: [],
    rejected_claim_ids: rejected,
    decisive_evidence: [],
    blockers: blockers.length > 0 ? blockers : ["no evidence claim survived freshness filtering"],
    next_route: "supply fresh evidence bound to the live PR head",
  };
}
