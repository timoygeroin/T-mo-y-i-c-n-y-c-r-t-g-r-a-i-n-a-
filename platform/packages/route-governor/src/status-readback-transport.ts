export type StatusReadbackTransportKind =
  | "checks_api"
  | "actions_api"
  | "workflow_published_readback"
  | "github_cli"
  | "pr_metadata"
  | "commit_diff";

export type StatusReadbackTransportState = "reachable" | "blocked" | "missing" | "stale";

export type StatusReadbackTransportAction =
  | "use_status_transport"
  | "emit_exact_status_access_blocker"
  | "reject_non_status_surface";

export interface StatusReadbackTransportSurface {
  kind: StatusReadbackTransportKind;
  state: StatusReadbackTransportState;
  head_sha?: string;
  evidence: string;
}

export interface StatusReadbackTransportInput {
  branch: string;
  active_branch: string;
  required_head_sha: string;
  previous_readback_head_sha: string;
  surfaces: StatusReadbackTransportSurface[];
}

export interface StatusReadbackTransportVerdict {
  ok: boolean;
  action: StatusReadbackTransportAction;
  branch: string;
  required_head_sha: string;
  selected_surface: StatusReadbackTransportSurface | null;
  decisive_evidence: string[];
  blocker: string | null;
  next_route: string;
}

const STATUS_SURFACE_KINDS = new Set<StatusReadbackTransportKind>([
  "checks_api",
  "actions_api",
  "workflow_published_readback",
  "github_cli",
]);

function isStatusSurface(surface: StatusReadbackTransportSurface): boolean {
  return STATUS_SURFACE_KINDS.has(surface.kind);
}

function belongsToRequiredHead(surface: StatusReadbackTransportSurface, requiredHeadSha: string): boolean {
  return !surface.head_sha || surface.head_sha === requiredHeadSha;
}

function exactBlocker(input: StatusReadbackTransportInput, evidence: string[]): StatusReadbackTransportVerdict {
  return {
    ok: false,
    action: "emit_exact_status_access_blocker",
    branch: input.branch,
    required_head_sha: input.required_head_sha,
    selected_surface: null,
    decisive_evidence: evidence,
    blocker: `CURRENT_HEAD_STATUS_READBACK_BLOCKED:${input.required_head_sha}:no reachable Checks, Actions, GitHub CLI, or workflow-published readback surface is available for ${input.branch}`,
    next_route: "obtain an authenticated current-head Checks/Actions surface or let the PR Head Status Readback workflow publish one before making status claims",
  };
}

export function compileStatusReadbackTransport(
  input: StatusReadbackTransportInput,
): StatusReadbackTransportVerdict {
  if (input.branch !== input.active_branch) {
    return {
      ok: false,
      action: "emit_exact_status_access_blocker",
      branch: input.branch,
      required_head_sha: input.required_head_sha,
      selected_surface: null,
      decisive_evidence: [],
      blocker: `STATUS_READBACK_BRANCH_MISMATCH:${input.branch}:active branch is ${input.active_branch}`,
      next_route: "bind readback transport to the active PR branch before selecting a status surface",
    };
  }

  const reachableStatusSurfaces = input.surfaces.filter(
    (surface) => surface.state === "reachable" && isStatusSurface(surface) && belongsToRequiredHead(surface, input.required_head_sha),
  );

  if (reachableStatusSurfaces.length > 0) {
    const selected = reachableStatusSurfaces[0];
    return {
      ok: true,
      action: "use_status_transport",
      branch: input.branch,
      required_head_sha: input.required_head_sha,
      selected_surface: selected,
      decisive_evidence: [selected.evidence],
      blocker: null,
      next_route: "read and classify only the selected current-head status surface",
    };
  }

  const reachableNonStatus = input.surfaces.filter((surface) => surface.state === "reachable" && !isStatusSurface(surface));
  const blockedStatus = input.surfaces.filter((surface) => isStatusSurface(surface) && surface.state === "blocked");
  const staleStatus = input.surfaces.filter(
    (surface) => isStatusSurface(surface) && surface.state === "stale" && surface.head_sha !== input.required_head_sha,
  );
  const movedSinceReadback = input.required_head_sha !== input.previous_readback_head_sha;

  if (reachableNonStatus.length > 0 && blockedStatus.length === 0 && staleStatus.length === 0) {
    return {
      ok: false,
      action: "reject_non_status_surface",
      branch: input.branch,
      required_head_sha: input.required_head_sha,
      selected_surface: null,
      decisive_evidence: reachableNonStatus.map((surface) => `${surface.kind}: ${surface.evidence}`),
      blocker: `NON_STATUS_SURFACE_ONLY:${input.required_head_sha}:PR metadata or commit diffs cannot prove current-head status`,
      next_route: "obtain a Checks, Actions, GitHub CLI, or workflow-published status surface before making a readback claim",
    };
  }

  return exactBlocker(input, [
    ...(movedSinceReadback ? [`head moved since previous readback: ${input.previous_readback_head_sha} -> ${input.required_head_sha}`] : []),
    ...blockedStatus.map((surface) => `${surface.kind} blocked: ${surface.evidence}`),
    ...staleStatus.map((surface) => `${surface.kind} stale for ${surface.head_sha ?? "unknown head"}: ${surface.evidence}`),
    ...reachableNonStatus.map((surface) => `${surface.kind} is not a status surface: ${surface.evidence}`),
  ]);
}
