export type CurrentSurfaceKind =
  | "live_pr_metadata"
  | "direct_status_surface"
  | "pr_body_summary"
  | "prompt_carried_head"
  | "memory_receipt";

export type CurrentSurfaceStatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "unknown";

export type CurrentSurfaceMoveClass = "external_platform_embodiment" | "fresh_status_readback" | "exact_external_blocker";

export type CurrentSurfaceIntakeAction =
  | "admit_surface_bound_embodiment"
  | "route_to_live_status_readback"
  | "route_to_live_failure_repair"
  | "route_to_exact_blocker"
  | "block_branch_mismatch"
  | "block_missing_live_metadata"
  | "block_stale_candidate_base"
  | "block_incomplete_candidate";

export interface CurrentSurfaceObservation {
  surface_id: string;
  kind: CurrentSurfaceKind;
  branch: string;
  head_sha?: string;
  status_verdict?: CurrentSurfaceStatusVerdict;
  evidence: string[];
}

export interface CurrentSurfaceCandidate {
  move_class: CurrentSurfaceMoveClass;
  branch: string;
  base_head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  blocker?: string;
}

export interface CurrentSurfaceIntakeInput {
  active_branch: string;
  live_head_sha: string;
  resolved_historical_heads: string[];
  observations: CurrentSurfaceObservation[];
  candidate: CurrentSurfaceCandidate;
}

export interface CurrentSurfaceIntakeVerdict {
  ok: boolean;
  action: CurrentSurfaceIntakeAction;
  branch: string;
  head_sha: string;
  accepted_surface_ids: string[];
  quarantined_surface_ids: string[];
  historical_surface_ids: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const SUMMARY_KINDS = new Set<CurrentSurfaceKind>(["pr_body_summary", "prompt_carried_head", "memory_receipt"]);

function executablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function base(input: CurrentSurfaceIntakeInput): Pick<CurrentSurfaceIntakeVerdict, "branch" | "head_sha"> {
  return { branch: input.active_branch, head_sha: input.live_head_sha };
}

function observationOnLiveHead(input: CurrentSurfaceIntakeInput, observation: CurrentSurfaceObservation): boolean {
  return observation.branch === input.active_branch && observation.head_sha === input.live_head_sha;
}

function isHistorical(input: CurrentSurfaceIntakeInput, observation: CurrentSurfaceObservation): boolean {
  return Boolean(observation.head_sha) && input.resolved_historical_heads.includes(observation.head_sha ?? "");
}

function classifySurfaces(input: CurrentSurfaceIntakeInput): Pick<
  CurrentSurfaceIntakeVerdict,
  "accepted_surface_ids" | "quarantined_surface_ids" | "historical_surface_ids"
> {
  const accepted: string[] = [];
  const quarantined: string[] = [];
  const historical: string[] = [];

  for (const observation of input.observations) {
    if (observationOnLiveHead(input, observation) && observation.kind !== "prompt_carried_head") {
      accepted.push(observation.surface_id);
      continue;
    }
    if (isHistorical(input, observation)) {
      historical.push(observation.surface_id);
      continue;
    }
    if (SUMMARY_KINDS.has(observation.kind) || observation.head_sha || observation.branch !== input.active_branch) {
      quarantined.push(observation.surface_id);
    }
  }

  return { accepted_surface_ids: accepted, quarantined_surface_ids: quarantined, historical_surface_ids: historical };
}

function block(
  input: CurrentSurfaceIntakeInput,
  action: Exclude<
    CurrentSurfaceIntakeAction,
    | "admit_surface_bound_embodiment"
    | "route_to_live_status_readback"
    | "route_to_live_failure_repair"
    | "route_to_exact_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): CurrentSurfaceIntakeVerdict {
  return {
    ...base(input),
    ...classifySurfaces(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function directLiveStatus(input: CurrentSurfaceIntakeInput): CurrentSurfaceObservation[] {
  return input.observations.filter(
    (observation) => observation.kind === "direct_status_surface" && observationOnLiveHead(input, observation),
  );
}

function incompleteEmbodiment(candidate: CurrentSurfaceCandidate): string[] {
  const blockers: string[] = [];

  if (!candidate.changed_files.some(executablePlatformPath)) {
    blockers.push("current-surface candidate changes no executable platform file");
  }
  if (candidate.executable_artifacts.length === 0) {
    blockers.push("current-surface candidate has no executable artifact evidence");
  }
  if (candidate.routing_artifacts.length === 0) {
    blockers.push("current-surface candidate has no future-routing artifact evidence");
  }

  return blockers;
}

export function intakeCurrentSurface(input: CurrentSurfaceIntakeInput): CurrentSurfaceIntakeVerdict {
  if (input.candidate.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`candidate branch ${input.candidate.branch} does not match active branch ${input.active_branch}`],
      "rebind the candidate to the active manifestation branch before release",
    );
  }

  const liveMetadata = input.observations.filter(
    (observation) => observation.kind === "live_pr_metadata" && observationOnLiveHead(input, observation),
  );

  if (liveMetadata.length === 0) {
    return block(
      input,
      "block_missing_live_metadata",
      [`no live PR metadata observation is bound to ${input.active_branch}@${input.live_head_sha}`],
      "read live PR metadata before arbitrating prompt or PR-body head claims",
    );
  }

  const candidate = input.candidate;
  if (candidate.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_candidate_base",
      [`candidate base ${candidate.base_head_sha} is not live head ${input.live_head_sha}`],
      "rebase the candidate to the live PR head and quarantine stale prompt or PR-body heads as non-current",
      liveMetadata.flatMap((surface) => surface.evidence),
    );
  }

  const statusSurfaces = directLiveStatus(input);
  const failing = statusSurfaces.filter((surface) => surface.status_verdict === "failing");
  if (failing.length > 0) {
    return {
      ...base(input),
      ...classifySurfaces(input),
      ok: false,
      action: "route_to_live_failure_repair",
      decisive_evidence: failing.flatMap((surface) => [surface.surface_id, ...surface.evidence]),
      blockers: failing.flatMap((surface) => (surface.evidence.length > 0 ? surface.evidence : [`live status failed on ${surface.surface_id}`])),
      next_route: "repair only the live-head-bound failure before claiming another embodiment",
    };
  }

  const passing = statusSurfaces.filter(
    (surface) => surface.status_verdict === "passing" || surface.status_verdict === "passing_with_warnings",
  );
  if (candidate.move_class === "fresh_status_readback" && passing.length > 0) {
    return {
      ...base(input),
      ...classifySurfaces(input),
      ok: true,
      action: "route_to_live_status_readback",
      decisive_evidence: passing.flatMap((surface) => [surface.surface_id, ...surface.evidence]),
      blockers: [],
      next_route: "publish only the live-head status readback, then select a non-repeated embodiment",
    };
  }

  if (candidate.move_class === "exact_external_blocker") {
    const blocker = candidate.blocker?.trim();
    return {
      ...base(input),
      ...classifySurfaces(input),
      ok: Boolean(blocker),
      action: "route_to_exact_blocker",
      decisive_evidence: blocker ? [blocker, `live head ${input.live_head_sha}`] : [`live head ${input.live_head_sha}`],
      blockers: blocker ? [blocker] : ["exact external blocker candidate has no blocker text"],
      next_route: blocker
        ? "resolve the named live-head blocker before another finalization progress claim"
        : "name the exact live-head blocker or choose executable embodiment",
    };
  }

  const blockers = incompleteEmbodiment(candidate);
  if (blockers.length > 0) {
    return block(
      input,
      "block_incomplete_candidate",
      blockers,
      "supply executable, routing, and changed-file evidence before moving the branch",
      liveMetadata.flatMap((surface) => surface.evidence),
    );
  }

  return {
    ...base(input),
    ...classifySurfaces(input),
    ok: true,
    action: "admit_surface_bound_embodiment",
    decisive_evidence: [
      ...liveMetadata.flatMap((surface) => surface.evidence),
      ...candidate.changed_files.filter(executablePlatformPath),
      ...candidate.executable_artifacts,
      ...candidate.routing_artifacts,
    ],
    blockers: [],
    next_route: "commit the embodiment against the live PR head; bind the next status readback to the moved head",
  };
}
