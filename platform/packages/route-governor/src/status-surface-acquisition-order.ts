export type StatusSurfaceAcquisitionKind =
  | "check_run"
  | "workflow_run"
  | "combined_status"
  | "step_summary"
  | "proof_artifact"
  | "live_pr_metadata"
  | "pr_body_summary"
  | "pr_comment"
  | "prompt_carried_head"
  | "memory_receipt";

export type StatusSurfaceVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "unknown";

export type StatusSurfaceAcquisitionAction =
  | "accept_live_status_surface"
  | "request_live_status_surface"
  | "block_metadata_only_status_claim"
  | "block_stale_status_surface"
  | "block_branch_mismatch";

export interface StatusSurfaceObservation {
  surface_id: string;
  kind: StatusSurfaceAcquisitionKind;
  branch: string;
  head_sha?: string;
  verdict?: StatusSurfaceVerdict;
  evidence: string[];
}

export interface StatusSurfaceAcquisitionInput {
  active_branch: string;
  live_head_sha: string;
  observations: StatusSurfaceObservation[];
}

export interface StatusSurfaceAcquisitionVerdict {
  ok: boolean;
  action: StatusSurfaceAcquisitionAction;
  branch: string;
  head_sha: string;
  status_claim: "bound_to_live_head" | "none";
  accepted_surface_ids: string[];
  quarantined_surface_ids: string[];
  stale_status_surface_ids: string[];
  decisive_evidence: string[];
  blockers: string[];
  acquisition_order: StatusSurfaceAcquisitionKind[];
  next_route: string;
}

const STATUS_SURFACE_KINDS = new Set<StatusSurfaceAcquisitionKind>([
  "check_run",
  "workflow_run",
  "combined_status",
  "step_summary",
  "proof_artifact",
]);

const METADATA_ONLY_KINDS = new Set<StatusSurfaceAcquisitionKind>([
  "live_pr_metadata",
  "pr_body_summary",
  "pr_comment",
  "prompt_carried_head",
  "memory_receipt",
]);

const ACQUISITION_ORDER: StatusSurfaceAcquisitionKind[] = [
  "check_run",
  "workflow_run",
  "combined_status",
  "step_summary",
  "proof_artifact",
];

function onLiveHead(input: StatusSurfaceAcquisitionInput, observation: StatusSurfaceObservation): boolean {
  return observation.branch === input.active_branch && observation.head_sha === input.live_head_sha;
}

function isStatusSurface(observation: StatusSurfaceObservation): boolean {
  return STATUS_SURFACE_KINDS.has(observation.kind);
}

function isMetadataOnly(observation: StatusSurfaceObservation): boolean {
  return METADATA_ONLY_KINDS.has(observation.kind);
}

function classify(input: StatusSurfaceAcquisitionInput): Pick<
  StatusSurfaceAcquisitionVerdict,
  "accepted_surface_ids" | "quarantined_surface_ids" | "stale_status_surface_ids"
> {
  const accepted: string[] = [];
  const quarantined: string[] = [];
  const stale: string[] = [];

  for (const observation of input.observations) {
    if (isStatusSurface(observation) && onLiveHead(input, observation)) {
      accepted.push(observation.surface_id);
      continue;
    }

    if (isStatusSurface(observation) && observation.head_sha && observation.head_sha !== input.live_head_sha) {
      stale.push(observation.surface_id);
      continue;
    }

    if (isMetadataOnly(observation) || observation.branch !== input.active_branch || observation.head_sha !== input.live_head_sha) {
      quarantined.push(observation.surface_id);
    }
  }

  return { accepted_surface_ids: accepted, quarantined_surface_ids: quarantined, stale_status_surface_ids: stale };
}

function base(
  input: StatusSurfaceAcquisitionInput,
): Pick<StatusSurfaceAcquisitionVerdict, "branch" | "head_sha" | "acquisition_order"> {
  return {
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    acquisition_order: ACQUISITION_ORDER,
  };
}

export function orderStatusSurfaceAcquisition(
  input: StatusSurfaceAcquisitionInput,
): StatusSurfaceAcquisitionVerdict {
  const classified = classify(input);
  const liveStatusSurfaces = input.observations.filter((observation) => isStatusSurface(observation) && onLiveHead(input, observation));

  const branchMismatches = input.observations.filter(
    (observation) => observation.branch !== input.active_branch && observation.head_sha === input.live_head_sha,
  );

  if (branchMismatches.length > 0) {
    return {
      ...base(input),
      ...classified,
      ok: false,
      action: "block_branch_mismatch",
      status_claim: "none",
      decisive_evidence: [],
      blockers: branchMismatches.map(
        (observation) => `surface ${observation.surface_id} is bound to ${observation.branch}, not ${input.active_branch}`,
      ),
      next_route: "read status from the active PR branch before claiming current-head status",
    };
  }

  if (liveStatusSurfaces.length > 0) {
    const decisive = liveStatusSurfaces.flatMap((surface) => [
      surface.surface_id,
      `${surface.kind}:${surface.verdict ?? "unknown"}`,
      ...surface.evidence,
    ]);

    return {
      ...base(input),
      ...classified,
      ok: true,
      action: "accept_live_status_surface",
      status_claim: "bound_to_live_head",
      decisive_evidence: decisive,
      blockers: [],
      next_route: "route from the live-head status verdict; do not reuse metadata-only surfaces as status evidence",
    };
  }

  if (classified.stale_status_surface_ids.length > 0) {
    return {
      ...base(input),
      ...classified,
      ok: false,
      action: "block_stale_status_surface",
      status_claim: "none",
      decisive_evidence: classified.stale_status_surface_ids,
      blockers: classified.stale_status_surface_ids.map(
        (surfaceId) => `status surface ${surfaceId} is not bound to live head ${input.live_head_sha}`,
      ),
      next_route: "discard stale status and acquire check runs, workflow runs, combined status, step summary, or proof artifact for the live head",
    };
  }

  const metadataOnly = input.observations.filter((observation) => isMetadataOnly(observation) && onLiveHead(input, observation));
  if (metadataOnly.length > 0) {
    return {
      ...base(input),
      ...classified,
      ok: false,
      action: "block_metadata_only_status_claim",
      status_claim: "none",
      decisive_evidence: metadataOnly.flatMap((surface) => [surface.surface_id, ...surface.evidence]),
      blockers: [`live PR metadata for ${input.live_head_sha} is not a GitHub Checks/Actions status surface`],
      next_route: "acquire one live-head status surface in order: check_run, workflow_run, combined_status, step_summary, proof_artifact",
    };
  }

  return {
    ...base(input),
    ...classified,
    ok: false,
    action: "request_live_status_surface",
    status_claim: "none",
    decisive_evidence: [],
    blockers: [`no status surface is bound to live head ${input.live_head_sha}`],
    next_route: "acquire one live-head status surface in order: check_run, workflow_run, combined_status, step_summary, proof_artifact",
  };
}
