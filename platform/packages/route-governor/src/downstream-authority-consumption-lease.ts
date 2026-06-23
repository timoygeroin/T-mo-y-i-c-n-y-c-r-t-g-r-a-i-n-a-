export type DownstreamAuthorityKind =
  | "review_request"
  | "review_response"
  | "mergeability"
  | "merge_finalization"
  | "blocker_retirement"
  | "exact_external_blocker"
  | "metadata_reread"
  | "duplicate_comment"
  | "warning_maintenance";

export type DownstreamStatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "no_status_surface";

export type DownstreamAuthorityConsumptionAction =
  | "admit_downstream_authority"
  | "require_moved_head_status"
  | "route_current_head_repair"
  | "emit_exact_external_blocker"
  | "block_non_progress_authority"
  | "block_replayed_authority"
  | "block_branch_mismatch"
  | "block_stale_status_lease"
  | "block_missing_exact_blocker";

export interface DownstreamStatusAuthorityLease {
  lease_id: string;
  branch: string;
  head_sha: string;
  ok: boolean;
  verdict: DownstreamStatusVerdict;
  evidence: string[];
  blockers: string[];
  warnings?: string[];
}

export interface DownstreamAuthorityConsumptionInput {
  active_branch: string;
  live_head_sha: string;
  previous_status_head_sha: string;
  authority_id: string;
  spent_authority_ids: string[];
  authority_kind: DownstreamAuthorityKind;
  status_lease?: DownstreamStatusAuthorityLease;
  exact_blocker?: string;
}

export interface DownstreamAuthorityConsumptionVerdict {
  ok: boolean;
  action: DownstreamAuthorityConsumptionAction;
  authority_id: string | null;
  authority_kind: DownstreamAuthorityKind;
  branch: string;
  head_sha: string;
  consumed_status_lease_id: string | null;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

const NON_PROGRESS_AUTHORITIES = new Set<DownstreamAuthorityKind>([
  "metadata_reread",
  "duplicate_comment",
  "warning_maintenance",
]);

function base(input: DownstreamAuthorityConsumptionInput): Pick<
  DownstreamAuthorityConsumptionVerdict,
  "authority_id" | "authority_kind" | "branch" | "head_sha" | "warnings"
> {
  return {
    authority_id: input.authority_id.trim() || null,
    authority_kind: input.authority_kind,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    warnings: input.status_lease?.warnings ?? [],
  };
}

function statusEvidence(lease: DownstreamStatusAuthorityLease): string[] {
  return [
    `status lease ${lease.lease_id}`,
    `status head ${lease.head_sha}`,
    `status verdict ${lease.verdict}`,
    ...lease.evidence,
    ...lease.blockers,
  ];
}

function block(
  input: DownstreamAuthorityConsumptionInput,
  action: Exclude<
    DownstreamAuthorityConsumptionAction,
    | "admit_downstream_authority"
    | "require_moved_head_status"
    | "route_current_head_repair"
    | "emit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): DownstreamAuthorityConsumptionVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    consumed_status_lease_id: null,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

export function consumeDownstreamAuthority(
  input: DownstreamAuthorityConsumptionInput,
): DownstreamAuthorityConsumptionVerdict {
  const authorityId = input.authority_id.trim();
  const routeEvidence = [
    `authority ${authorityId || "<missing>"}`,
    `authority kind ${input.authority_kind}`,
    `live head ${input.live_head_sha}`,
    `previous status head ${input.previous_status_head_sha}`,
  ];

  if (!authorityId || input.spent_authority_ids.includes(authorityId)) {
    return block(
      input,
      "block_replayed_authority",
      [authorityId ? `downstream authority already spent: ${authorityId}` : "downstream authority has no id"],
      "compile a fresh downstream authority id before consuming review, merge, or blocker-retirement power",
      routeEvidence,
    );
  }

  if (NON_PROGRESS_AUTHORITIES.has(input.authority_kind)) {
    return block(
      input,
      "block_non_progress_authority",
      [`${input.authority_kind} cannot consume downstream authority as progress`],
      "choose review request, review response, mergeability, merge finalization, blocker retirement, or one exact blocker",
      routeEvidence,
    );
  }

  if (input.authority_kind === "exact_external_blocker") {
    const blocker = input.exact_blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_missing_exact_blocker",
        ["downstream exact-blocker authority has no blocker text"],
        "name the exact downstream external blocker or supply a current status lease",
        routeEvidence,
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_exact_external_blocker",
      consumed_status_lease_id: null,
      decisive_evidence: [...routeEvidence, blocker],
      blockers: [blocker],
      next_route: "remove the named downstream blocker before consuming review, merge, or blocker-retirement authority",
    };
  }

  const lease = input.status_lease;
  const headMovedSinceStatus = input.previous_status_head_sha !== input.live_head_sha;

  if (!lease) {
    return {
      ...base(input),
      ok: false,
      action: headMovedSinceStatus ? "require_moved_head_status" : "block_stale_status_lease",
      consumed_status_lease_id: null,
      decisive_evidence: routeEvidence,
      blockers: [
        headMovedSinceStatus
          ? `live head ${input.live_head_sha} has no status lease after previous status head ${input.previous_status_head_sha}`
          : `no status lease supplied for live head ${input.live_head_sha}`,
      ],
      warnings: [],
      next_route: "obtain a current live-head status lease before consuming downstream authority",
    };
  }

  if (lease.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`status lease ${lease.lease_id} is on ${lease.branch}, not ${input.active_branch}`],
      "discard cross-branch status authority before downstream consumption",
      [...routeEvidence, ...statusEvidence(lease)],
    );
  }

  if (lease.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_status_lease",
      [`status lease ${lease.lease_id} belongs to ${lease.head_sha}, not live head ${input.live_head_sha}`],
      "obtain a current live-head status lease before consuming downstream authority",
      [...routeEvidence, ...statusEvidence(lease)],
    );
  }

  if (!lease.ok || lease.verdict === "pending" || lease.verdict === "no_status_surface") {
    return {
      ...base(input),
      ok: false,
      action: "require_moved_head_status",
      consumed_status_lease_id: lease.lease_id,
      decisive_evidence: [...routeEvidence, ...statusEvidence(lease)],
      blockers: lease.blockers.length > 0 ? lease.blockers : [`status lease ${lease.lease_id} is ${lease.verdict}`],
      warnings: lease.warnings ?? [],
      next_route: "wait for a concrete passing or failing live-head status lease before downstream authority is consumed",
    };
  }

  if (lease.verdict === "failing") {
    return {
      ...base(input),
      ok: false,
      action: "route_current_head_repair",
      consumed_status_lease_id: lease.lease_id,
      decisive_evidence: [...routeEvidence, ...statusEvidence(lease)],
      blockers: lease.blockers.length > 0 ? lease.blockers : [`live head ${input.live_head_sha} is failing`],
      warnings: lease.warnings ?? [],
      next_route: "repair the current-head failure before consuming review, merge, or blocker-retirement authority",
    };
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_downstream_authority",
    consumed_status_lease_id: lease.lease_id,
    decisive_evidence: [...routeEvidence, ...statusEvidence(lease)],
    blockers: [],
    warnings: lease.warnings ?? [],
    next_route: "consume this downstream authority once; after any branch move, require a new live-head status lease",
  };
}
