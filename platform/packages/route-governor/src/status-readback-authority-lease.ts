export type StatusReadbackLeaseVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "no_status_surface";

export type StatusReadbackAuthorityLeaseAction =
  | "admit_current_status_lease"
  | "expire_prior_status_lease"
  | "route_current_head_repair"
  | "route_current_head_embodiment"
  | "block_branch_mismatch"
  | "block_missing_status_surface"
  | "block_replayed_status_lease";

export interface StatusReadbackLeaseSurface {
  surface_id: string;
  head_sha: string;
  verdict: StatusReadbackLeaseVerdict;
  check_run_ids: string[];
  workflow_run_ids: string[];
  decisive_successes: string[];
  blocking_failures: string[];
  non_blocking_warnings: string[];
}

export interface StatusReadbackAuthorityLeaseInput {
  active_branch: string;
  status_branch: string;
  live_head_sha: string;
  previous_lease_head_sha?: string;
  previous_lease_surface_ids: string[];
  spent_lease_ids: string[];
  candidate_lease_id: string;
  status_surface?: StatusReadbackLeaseSurface;
}

export interface StatusReadbackAuthorityLeaseVerdict {
  ok: boolean;
  action: StatusReadbackAuthorityLeaseAction;
  branch: string;
  head_sha: string;
  lease_id: string | null;
  authority_head_sha: string | null;
  expired_head_shas: string[];
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

function base(input: StatusReadbackAuthorityLeaseInput): Pick<
  StatusReadbackAuthorityLeaseVerdict,
  "branch" | "head_sha" | "warnings"
> {
  return {
    branch: input.status_branch,
    head_sha: input.live_head_sha,
    warnings: input.status_surface?.non_blocking_warnings ?? [],
  };
}

function previousLeaseExpired(input: StatusReadbackAuthorityLeaseInput): boolean {
  return Boolean(input.previous_lease_head_sha) && input.previous_lease_head_sha !== input.live_head_sha;
}

function currentSurfaceEvidence(surface: StatusReadbackLeaseSurface): string[] {
  return [
    surface.surface_id,
    ...surface.check_run_ids.map((id) => `check:${id}`),
    ...surface.workflow_run_ids.map((id) => `workflow:${id}`),
    ...surface.decisive_successes,
    ...surface.blocking_failures,
  ];
}

function expiredHeads(input: StatusReadbackAuthorityLeaseInput): string[] {
  return previousLeaseExpired(input) && input.previous_lease_head_sha ? [input.previous_lease_head_sha] : [];
}

function block(
  input: StatusReadbackAuthorityLeaseInput,
  action: Exclude<
    StatusReadbackAuthorityLeaseAction,
    | "admit_current_status_lease"
    | "expire_prior_status_lease"
    | "route_current_head_repair"
    | "route_current_head_embodiment"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): StatusReadbackAuthorityLeaseVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    lease_id: null,
    authority_head_sha: null,
    expired_head_shas: expiredHeads(input),
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

export function compileStatusReadbackAuthorityLease(
  input: StatusReadbackAuthorityLeaseInput,
): StatusReadbackAuthorityLeaseVerdict {
  if (input.status_branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`status branch ${input.status_branch} does not match active branch ${input.active_branch}`],
      "bind status authority only to the active manifestation branch",
    );
  }

  if (input.spent_lease_ids.includes(input.candidate_lease_id)) {
    return block(
      input,
      "block_replayed_status_lease",
      [`status lease id already spent: ${input.candidate_lease_id}`],
      "create a new lease id for a new live-head status surface",
    );
  }

  const surface = input.status_surface;
  if (!surface) {
    if (previousLeaseExpired(input)) {
      return {
        ...base(input),
        ok: true,
        action: "expire_prior_status_lease",
        lease_id: null,
        authority_head_sha: null,
        expired_head_shas: expiredHeads(input),
        decisive_evidence: [
          `previous lease ${input.previous_lease_head_sha} expired because live head is ${input.live_head_sha}`,
          ...input.previous_lease_surface_ids,
        ],
        blockers: [],
        next_route: "obtain a live-head status surface before making status claims or repairing failures",
      };
    }

    return block(
      input,
      "block_missing_status_surface",
      [`no status surface supplied for live head ${input.live_head_sha}`],
      "obtain Checks, Actions, or workflow status evidence for the live head",
    );
  }

  if (surface.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_missing_status_surface",
      [`status surface ${surface.surface_id} belongs to ${surface.head_sha}, not live head ${input.live_head_sha}`],
      "discard stale status evidence and obtain a live-head status surface",
      currentSurfaceEvidence(surface),
    );
  }

  if (!input.candidate_lease_id.trim()) {
    return block(
      input,
      "block_missing_status_surface",
      ["status authority lease has no lease id"],
      "supply a durable lease id for the live-head status surface",
      currentSurfaceEvidence(surface),
    );
  }

  if (surface.verdict === "failing") {
    return {
      ...base(input),
      ok: true,
      action: "route_current_head_repair",
      lease_id: input.candidate_lease_id,
      authority_head_sha: input.live_head_sha,
      expired_head_shas: expiredHeads(input),
      decisive_evidence: currentSurfaceEvidence(surface),
      blockers: surface.blocking_failures.length > 0 ? surface.blocking_failures : [`live head ${input.live_head_sha} is failing`],
      next_route: "repair only the failure authorized by the current-head status lease",
    };
  }

  if (surface.verdict === "pending") {
    return block(
      input,
      "block_missing_status_surface",
      [`status surface ${surface.surface_id} is still pending for ${input.live_head_sha}`],
      "wait for the live-head status surface to complete before leasing authority",
      currentSurfaceEvidence(surface),
    );
  }

  if (surface.verdict === "no_status_surface") {
    return block(
      input,
      "block_missing_status_surface",
      [`status surface ${surface.surface_id} has no check or workflow evidence for ${input.live_head_sha}`],
      "obtain a concrete live-head Checks or Actions surface before leasing authority",
      currentSurfaceEvidence(surface),
    );
  }

  return {
    ...base(input),
    ok: true,
    action: surface.verdict === "passing" || surface.verdict === "passing_with_warnings"
      ? "admit_current_status_lease"
      : "route_current_head_embodiment",
    lease_id: input.candidate_lease_id,
    authority_head_sha: input.live_head_sha,
    expired_head_shas: expiredHeads(input),
    decisive_evidence: currentSurfaceEvidence(surface),
    blockers: [],
    next_route: "use this leased current-head status authority to choose the next non-repeated embodiment or exact blocker",
  };
}
