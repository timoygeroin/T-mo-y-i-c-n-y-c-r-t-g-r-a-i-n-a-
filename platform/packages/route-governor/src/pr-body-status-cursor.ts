export type PrBodyStatusCursorCandidateClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "current_head_failure_repair"
  | "exact_external_blocker";

export type PrBodyStatusCursorStatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "unknown";

export type PrBodyStatusCursorAction =
  | "admit_live_head_embodiment"
  | "require_live_head_status_readback"
  | "route_live_head_failure_repair"
  | "route_exact_external_blocker"
  | "block_branch_mismatch"
  | "block_stale_candidate_base"
  | "block_incomplete_candidate";

export interface PrBodyStatusCursorSurface {
  surface_id: string;
  head_sha?: string;
  verdict: PrBodyStatusCursorStatusVerdict;
  decisive_items: string[];
  warnings: string[];
}

export interface PrBodyStatusCursorCandidate {
  candidate_class: PrBodyStatusCursorCandidateClass;
  branch: string;
  base_head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  blocker?: string;
}

export interface PrBodyStatusCursorInput {
  active_branch: string;
  live_pr_branch: string;
  live_pr_head_sha: string;
  pr_body_status_head_sha?: string;
  prompt_status_head_sha?: string;
  resolved_historical_head_shas: string[];
  direct_status_surfaces: PrBodyStatusCursorSurface[];
  candidate: PrBodyStatusCursorCandidate;
}

export interface PrBodyStatusCursorVerdict {
  ok: boolean;
  action: PrBodyStatusCursorAction;
  branch: string;
  head_sha: string;
  accepted_status_surface_ids: string[];
  stale_status_surface_ids: string[];
  quarantined_summary_heads: string[];
  historical_status_heads: string[];
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

function executablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function base(input: PrBodyStatusCursorInput): Pick<PrBodyStatusCursorVerdict, "branch" | "head_sha"> {
  return { branch: input.live_pr_branch, head_sha: input.live_pr_head_sha };
}

function liveStatusSurfaces(input: PrBodyStatusCursorInput): PrBodyStatusCursorSurface[] {
  return input.direct_status_surfaces.filter((surface) => surface.head_sha === input.live_pr_head_sha);
}

function staleStatusSurfaces(input: PrBodyStatusCursorInput): PrBodyStatusCursorSurface[] {
  return input.direct_status_surfaces.filter(
    (surface) => Boolean(surface.head_sha) && surface.head_sha !== input.live_pr_head_sha,
  );
}

function summaryHeads(input: PrBodyStatusCursorInput): string[] {
  return [input.pr_body_status_head_sha, input.prompt_status_head_sha].filter(
    (head): head is string => Boolean(head) && head !== input.live_pr_head_sha,
  );
}

function historicalHeads(input: PrBodyStatusCursorInput): string[] {
  const historical = new Set(input.resolved_historical_head_shas);
  return summaryHeads(input).filter((head) => historical.has(head));
}

function quarantinedHeads(input: PrBodyStatusCursorInput): string[] {
  const historical = new Set(historicalHeads(input));
  return summaryHeads(input).filter((head) => !historical.has(head));
}

function warnings(input: PrBodyStatusCursorInput): string[] {
  return input.direct_status_surfaces.flatMap((surface) => surface.warnings);
}

function surfaceEvidence(surfaces: PrBodyStatusCursorSurface[]): string[] {
  return surfaces.flatMap((surface) => [surface.surface_id, ...surface.decisive_items]);
}

function block(
  input: PrBodyStatusCursorInput,
  action: Exclude<
    PrBodyStatusCursorAction,
    | "admit_live_head_embodiment"
    | "require_live_head_status_readback"
    | "route_live_head_failure_repair"
    | "route_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): PrBodyStatusCursorVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    accepted_status_surface_ids: liveStatusSurfaces(input).map((surface) => surface.surface_id),
    stale_status_surface_ids: staleStatusSurfaces(input).map((surface) => surface.surface_id),
    quarantined_summary_heads: quarantinedHeads(input),
    historical_status_heads: historicalHeads(input),
    decisive_evidence: evidence,
    blockers,
    warnings: warnings(input),
    next_route: nextRoute,
  };
}

function incompleteEmbodiment(candidate: PrBodyStatusCursorCandidate): string[] {
  const blockers: string[] = [];

  if (!candidate.changed_files.some(executablePlatformPath)) {
    blockers.push("PR-body status cursor embodiment changes no executable platform file");
  }
  if (candidate.executable_artifacts.length === 0) {
    blockers.push("PR-body status cursor embodiment has no executable artifact");
  }
  if (candidate.routing_artifacts.length === 0) {
    blockers.push("PR-body status cursor embodiment has no future-routing artifact");
  }

  return blockers;
}

export function compilePrBodyStatusCursor(input: PrBodyStatusCursorInput): PrBodyStatusCursorVerdict {
  if (input.live_pr_branch !== input.active_branch || input.candidate.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`PR body/candidate branch must match active branch ${input.active_branch}`],
      "bind PR-body status cursor to the active manifestation branch before release",
    );
  }

  if (input.candidate.base_head_sha !== input.live_pr_head_sha) {
    return block(
      input,
      "block_stale_candidate_base",
      [`candidate base ${input.candidate.base_head_sha} is not live PR head ${input.live_pr_head_sha}`],
      "rebase the next action to the live PR head and quarantine stale PR-body or prompt status heads",
      [`live PR head ${input.live_pr_head_sha}`],
    );
  }

  const live = liveStatusSurfaces(input);
  const failing = live.filter((surface) => surface.verdict === "failing");
  if (failing.length > 0) {
    return {
      ...base(input),
      ok: false,
      action: "route_live_head_failure_repair",
      accepted_status_surface_ids: failing.map((surface) => surface.surface_id),
      stale_status_surface_ids: staleStatusSurfaces(input).map((surface) => surface.surface_id),
      quarantined_summary_heads: quarantinedHeads(input),
      historical_status_heads: historicalHeads(input),
      decisive_evidence: surfaceEvidence(failing),
      blockers: failing.flatMap((surface) =>
        surface.decisive_items.length > 0 ? surface.decisive_items : [`live-head status failed on ${surface.surface_id}`],
      ),
      warnings: warnings(input),
      next_route: "repair only failure evidence bound to the live PR head; ignore stale PR-body or prompt status summaries",
    };
  }

  if (input.candidate.candidate_class === "fresh_status_readback") {
    const passing = live.filter(
      (surface) => surface.verdict === "passing" || surface.verdict === "passing_with_warnings",
    );

    return {
      ...base(input),
      ok: passing.length > 0,
      action: "require_live_head_status_readback",
      accepted_status_surface_ids: passing.map((surface) => surface.surface_id),
      stale_status_surface_ids: staleStatusSurfaces(input).map((surface) => surface.surface_id),
      quarantined_summary_heads: quarantinedHeads(input),
      historical_status_heads: historicalHeads(input),
      decisive_evidence: surfaceEvidence(passing),
      blockers: passing.length > 0 ? [] : [`no direct status surface is bound to live PR head ${input.live_pr_head_sha}`],
      warnings: warnings(input),
      next_route:
        passing.length > 0
          ? "publish only the live-head status readback"
          : "obtain direct live-head Checks, Actions, combined-status, or issue-published readback evidence",
    };
  }

  if (input.candidate.candidate_class === "exact_external_blocker") {
    const blocker = input.candidate.blocker?.trim();
    return {
      ...base(input),
      ok: Boolean(blocker),
      action: "route_exact_external_blocker",
      accepted_status_surface_ids: live.map((surface) => surface.surface_id),
      stale_status_surface_ids: staleStatusSurfaces(input).map((surface) => surface.surface_id),
      quarantined_summary_heads: quarantinedHeads(input),
      historical_status_heads: historicalHeads(input),
      decisive_evidence: blocker ? [blocker, `live PR head ${input.live_pr_head_sha}`] : [`live PR head ${input.live_pr_head_sha}`],
      blockers: blocker ? [blocker] : ["exact external blocker candidate has no blocker text"],
      warnings: warnings(input),
      next_route: blocker ? "resolve the named live-head blocker before progress" : "name one exact live-head blocker",
    };
  }

  const blockers = incompleteEmbodiment(input.candidate);
  if (blockers.length > 0) {
    return block(
      input,
      "block_incomplete_candidate",
      blockers,
      "supply executable changed files plus executable and routing evidence before moving the branch",
      [`live PR head ${input.live_pr_head_sha}`],
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_live_head_embodiment",
    accepted_status_surface_ids: live.map((surface) => surface.surface_id),
    stale_status_surface_ids: staleStatusSurfaces(input).map((surface) => surface.surface_id),
    quarantined_summary_heads: quarantinedHeads(input),
    historical_status_heads: historicalHeads(input),
    decisive_evidence: [
      `live PR head ${input.live_pr_head_sha}`,
      ...input.candidate.changed_files.filter(executablePlatformPath),
      ...input.candidate.executable_artifacts,
      ...input.candidate.routing_artifacts,
    ],
    blockers: [],
    warnings: warnings(input),
    next_route: "commit the live-head embodiment, then require status readback only for the new moved head",
  };
}
