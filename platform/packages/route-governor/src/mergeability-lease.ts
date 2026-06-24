export type MergeabilityLeaseSourceKind =
  | "live_pr_metadata"
  | "pr_body_summary"
  | "memory_receipt"
  | "status_surface";

export type MergeabilityLeaseTarget = "review_request" | "merge_command" | "finalization_surface_promotion";

export type MergeabilityLeaseAction =
  | "admit_mergeability_lease"
  | "block_branch_mismatch"
  | "block_stale_head"
  | "block_non_live_source"
  | "block_repeated_lease"
  | "block_missing_mergeability"
  | "block_unmergeable_pr";

export interface MergeabilityLeaseSource {
  source_id: string;
  kind: MergeabilityLeaseSourceKind;
  branch: string;
  head_sha?: string;
  mergeable?: boolean | null;
  evidence: string[];
}

export interface MergeabilityLeaseInput {
  active_branch: string;
  live_head_sha: string;
  lease_id: string;
  spent_lease_ids: string[];
  source: MergeabilityLeaseSource;
  target: MergeabilityLeaseTarget;
}

export interface MergeabilityLeaseVerdict {
  ok: boolean;
  action: MergeabilityLeaseAction;
  branch: string;
  head_sha: string;
  lease_id: string | null;
  target: MergeabilityLeaseTarget;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function base(input: MergeabilityLeaseInput): Pick<
  MergeabilityLeaseVerdict,
  "branch" | "head_sha" | "lease_id" | "target"
> {
  return {
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    lease_id: input.lease_id.trim() || null,
    target: input.target,
  };
}

function block(
  input: MergeabilityLeaseInput,
  action: Exclude<MergeabilityLeaseAction, "admit_mergeability_lease">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): MergeabilityLeaseVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

export function compileMergeabilityLease(input: MergeabilityLeaseInput): MergeabilityLeaseVerdict {
  const source = input.source;
  const sourceEvidence = [source.source_id, ...source.evidence];

  if (source.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`mergeability source branch ${source.branch} does not match active branch ${input.active_branch}`],
      "read live PR metadata for the active branch before review or merge handoff",
      sourceEvidence,
    );
  }

  if (source.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_head",
      [`mergeability source head ${source.head_sha ?? "<missing>"} is not live head ${input.live_head_sha}`],
      "discard stale mergeability and read PR metadata bound to the live head",
      sourceEvidence,
    );
  }

  if (source.kind !== "live_pr_metadata") {
    return block(
      input,
      "block_non_live_source",
      [`mergeability cannot be leased from ${source.kind}`],
      "use only live PR metadata as mergeability authority; keep PR body, status, and memory surfaces as context",
      sourceEvidence,
    );
  }

  const leaseId = input.lease_id.trim();
  if (!leaseId || input.spent_lease_ids.includes(leaseId)) {
    return block(
      input,
      "block_repeated_lease",
      [leaseId ? `mergeability lease already spent: ${leaseId}` : "mergeability lease has no id"],
      "issue a fresh mergeability lease for this live head before the target handoff",
      sourceEvidence,
    );
  }

  if (source.mergeable === undefined || source.mergeable === null) {
    return block(
      input,
      "block_missing_mergeability",
      ["live PR metadata did not include a mergeable verdict"],
      "read PR metadata until GitHub returns a concrete mergeability verdict, or emit the exact external blocker",
      sourceEvidence,
    );
  }

  if (!source.mergeable) {
    return block(
      input,
      "block_unmergeable_pr",
      [`live PR head ${input.live_head_sha} is not mergeable`],
      "repair mergeability before review-ready or merge-finalization handoff",
      sourceEvidence,
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_mergeability_lease",
    decisive_evidence: [
      `lease ${leaseId}`,
      `target ${input.target}`,
      `live head ${input.live_head_sha}`,
      `source ${source.source_id}`,
      "mergeable true",
      ...source.evidence,
    ],
    blockers: [],
    next_route:
      "use this lease only for the named target on the live head; refresh mergeability after any branch movement",
  };
}
