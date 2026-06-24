export type ReadbackAccessSource =
  | "github_checks_api"
  | "actions_runs_api"
  | "workflow_issue_readback"
  | "pr_metadata"
  | "commit_diff"
  | "public_rest_blocked"
  | "missing_cli";

export type ReadbackAccessAction =
  | "publish_live_head_readback"
  | "block_status_claim"
  | "route_to_executable_embodiment";

export interface ReadbackAccessInput {
  head_sha: string;
  requested_readback_head_sha: string;
  available_sources: ReadbackAccessSource[];
  status_surface_ids: string[];
  fallback_embodiment_available: boolean;
  blocker_text?: string;
}

export interface ReadbackAccessVerdict {
  ok: boolean;
  action: ReadbackAccessAction;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const STATUS_SOURCES = new Set<ReadbackAccessSource>([
  "github_checks_api",
  "actions_runs_api",
  "workflow_issue_readback",
]);

const NON_STATUS_SOURCES = new Set<ReadbackAccessSource>(["pr_metadata", "commit_diff"]);

function hasStatusSource(sources: ReadbackAccessSource[]): boolean {
  return sources.some((source) => STATUS_SOURCES.has(source));
}

function onlyHasNonStatusEvidence(sources: ReadbackAccessSource[]): boolean {
  return sources.length > 0 && sources.every((source) => NON_STATUS_SOURCES.has(source));
}

export function routeReadbackAccess(input: ReadbackAccessInput): ReadbackAccessVerdict {
  if (input.requested_readback_head_sha !== input.head_sha) {
    return {
      ok: false,
      action: "block_status_claim",
      head_sha: input.head_sha,
      decisive_evidence: [],
      blockers: [`requested status head ${input.requested_readback_head_sha} does not match live head ${input.head_sha}`],
      next_route: "rebind readback to the live PR head before any status claim",
    };
  }

  if (hasStatusSource(input.available_sources) && input.status_surface_ids.length > 0) {
    return {
      ok: true,
      action: "publish_live_head_readback",
      head_sha: input.head_sha,
      decisive_evidence: input.status_surface_ids,
      blockers: [],
      next_route: "publish the live-head readback, then select a non-repeated executable embodiment class",
    };
  }

  if (input.fallback_embodiment_available) {
    return {
      ok: true,
      action: "route_to_executable_embodiment",
      head_sha: input.head_sha,
      decisive_evidence: ["status surface unavailable", "fallback executable embodiment available"],
      blockers: [],
      next_route: "skip status-claim release and commit the non-repeated executable embodiment increment",
    };
  }

  const accessBlockers = [
    ...(input.blocker_text?.trim() ? [input.blocker_text.trim()] : []),
    ...(onlyHasNonStatusEvidence(input.available_sources)
      ? ["PR metadata and commit diff do not prove Checks or Actions status"]
      : []),
    ...(input.available_sources.includes("missing_cli") ? ["GitHub CLI is unavailable in the runtime"] : []),
    ...(input.available_sources.includes("public_rest_blocked") ? ["public GitHub REST status endpoints returned 403"] : []),
  ];

  return {
    ok: false,
    action: "block_status_claim",
    head_sha: input.head_sha,
    decisive_evidence: [],
    blockers: accessBlockers.length > 0 ? accessBlockers : ["no live-head status surface is available"],
    next_route: "obtain Checks, Actions, or workflow-published readback evidence for the live head before claiming status",
  };
}
