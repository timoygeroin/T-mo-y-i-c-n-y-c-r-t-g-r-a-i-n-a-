export type TriSurfaceKind = "scheduled_prompt" | "pr_body_summary" | "live_pr_metadata" | "direct_status_surface";

export type TriSurfaceStatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "unknown";

export type TriSurfaceConvergenceAction =
  | "converge_on_live_head"
  | "route_to_live_status_readback"
  | "route_to_live_failure_detail"
  | "block_missing_live_metadata"
  | "block_branch_mismatch";

export interface TriSurfaceObservation {
  surface_id: string;
  kind: TriSurfaceKind;
  branch: string;
  head_sha?: string;
  status_verdict?: TriSurfaceStatusVerdict;
  evidence: string[];
}

export interface TriSurfaceConvergenceInput {
  active_branch: string;
  live_head_sha: string;
  last_resolved_head_sha: string;
  observations: TriSurfaceObservation[];
}

export interface TriSurfaceConvergenceVerdict {
  ok: boolean;
  action: TriSurfaceConvergenceAction;
  branch: string;
  head_sha: string;
  accepted_surface_ids: string[];
  quarantined_surface_ids: string[];
  historical_surface_ids: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const SUMMARY_SURFACES = new Set<TriSurfaceKind>(["scheduled_prompt", "pr_body_summary"]);

function onActiveBranch(input: TriSurfaceConvergenceInput, surface: TriSurfaceObservation): boolean {
  return surface.branch === input.active_branch;
}

function onLiveHead(input: TriSurfaceConvergenceInput, surface: TriSurfaceObservation): boolean {
  return onActiveBranch(input, surface) && surface.head_sha === input.live_head_sha;
}

function onResolvedHead(input: TriSurfaceConvergenceInput, surface: TriSurfaceObservation): boolean {
  return onActiveBranch(input, surface) && surface.head_sha === input.last_resolved_head_sha;
}

function surfaceEvidence(surface: TriSurfaceObservation): string[] {
  return [surface.surface_id, ...surface.evidence];
}

function classify(input: TriSurfaceConvergenceInput): Pick<
  TriSurfaceConvergenceVerdict,
  "accepted_surface_ids" | "quarantined_surface_ids" | "historical_surface_ids"
> {
  const accepted: string[] = [];
  const quarantined: string[] = [];
  const historical: string[] = [];

  for (const surface of input.observations) {
    if (!onActiveBranch(input, surface)) {
      quarantined.push(surface.surface_id);
      continue;
    }

    if (onLiveHead(input, surface) && surface.kind !== "scheduled_prompt") {
      accepted.push(surface.surface_id);
      continue;
    }

    if (onResolvedHead(input, surface)) {
      historical.push(surface.surface_id);
      continue;
    }

    if (SUMMARY_SURFACES.has(surface.kind) || surface.head_sha) {
      quarantined.push(surface.surface_id);
    }
  }

  return {
    accepted_surface_ids: [...new Set(accepted)],
    quarantined_surface_ids: [...new Set(quarantined)],
    historical_surface_ids: [...new Set(historical)],
  };
}

function base(input: TriSurfaceConvergenceInput): Pick<TriSurfaceConvergenceVerdict, "branch" | "head_sha"> {
  return { branch: input.active_branch, head_sha: input.live_head_sha };
}

export function convergeTriSurfaceRoute(input: TriSurfaceConvergenceInput): TriSurfaceConvergenceVerdict {
  const wrongBranchSurfaces = input.observations.filter((surface) => !onActiveBranch(input, surface));
  if (wrongBranchSurfaces.length > 0) {
    return {
      ...base(input),
      ...classify(input),
      ok: false,
      action: "block_branch_mismatch",
      decisive_evidence: wrongBranchSurfaces.flatMap(surfaceEvidence),
      blockers: wrongBranchSurfaces.map(
        (surface) => `${surface.surface_id} belongs to ${surface.branch}, not ${input.active_branch}`,
      ),
      next_route: "discard wrong-branch surfaces before choosing a finalization route",
    };
  }

  const liveMetadata = input.observations.filter(
    (surface) => surface.kind === "live_pr_metadata" && onLiveHead(input, surface),
  );
  if (liveMetadata.length === 0) {
    return {
      ...base(input),
      ...classify(input),
      ok: false,
      action: "block_missing_live_metadata",
      decisive_evidence: [],
      blockers: [`no live PR metadata surface is bound to ${input.active_branch}@${input.live_head_sha}`],
      next_route: "read live PR metadata before reconciling scheduled prompt or PR body head claims",
    };
  }

  const liveStatus = input.observations.filter(
    (surface) => surface.kind === "direct_status_surface" && onLiveHead(input, surface),
  );
  const failingStatus = liveStatus.filter((surface) => surface.status_verdict === "failing");
  if (failingStatus.length > 0) {
    return {
      ...base(input),
      ...classify(input),
      ok: false,
      action: "route_to_live_failure_detail",
      decisive_evidence: failingStatus.flatMap(surfaceEvidence),
      blockers: failingStatus.flatMap((surface) =>
        surface.evidence.length > 0 ? surface.evidence : [`live head status failed on ${surface.surface_id}`],
      ),
      next_route: "obtain the concrete live-head failure detail before repairing or claiming progress",
    };
  }

  const passingStatus = liveStatus.filter(
    (surface) => surface.status_verdict === "passing" || surface.status_verdict === "passing_with_warnings",
  );
  if (passingStatus.length > 0) {
    return {
      ...base(input),
      ...classify(input),
      ok: true,
      action: "route_to_live_status_readback",
      decisive_evidence: passingStatus.flatMap(surfaceEvidence),
      blockers: [],
      next_route: "publish the live-head status readback, then choose a non-repeated executable embodiment",
    };
  }

  return {
    ...base(input),
    ...classify(input),
    ok: true,
    action: "converge_on_live_head",
    decisive_evidence: [
      `live PR head ${input.live_head_sha}`,
      ...liveMetadata.flatMap(surfaceEvidence),
      ...input.observations
        .filter((surface) => surface.head_sha && surface.head_sha !== input.live_head_sha)
        .map((surface) => `quarantine ${surface.surface_id}@${surface.head_sha}`),
    ],
    blockers: [],
    next_route: "continue only from the live PR head; stale scheduled or PR-body heads cannot authorize status, repair, or blocker claims",
  };
}
