export type LiveHeadAuthorityWindowActionRequest =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "review_request"
  | "merge_command"
  | "exact_external_blocker"
  | "metadata_reread"
  | "duplicate_ci_summary"
  | "warning_maintenance";

export type LiveHeadAuthoritySurfaceKind =
  | "live_pr_metadata"
  | "direct_status_surface"
  | "mergeability_metadata"
  | "pr_body_summary"
  | "prompt_instruction"
  | "memory_receipt"
  | "blocker_state";

export type LiveHeadAuthorityStatus = "passing" | "passing_with_warnings" | "failing" | "pending" | "unknown";

export type LiveHeadAuthorityWindowAction =
  | "admit_live_head_embodiment"
  | "admit_live_status_readback"
  | "admit_review_or_merge_authority"
  | "emit_exact_external_blocker"
  | "block_reused_window"
  | "block_branch_mismatch"
  | "block_missing_live_metadata"
  | "block_stale_candidate_base"
  | "block_non_progress_action"
  | "block_missing_live_status"
  | "block_failing_live_status"
  | "block_pending_live_status"
  | "block_missing_mergeability"
  | "block_unmergeable_live_head"
  | "block_incomplete_embodiment"
  | "block_missing_exact_blocker";

export interface LiveHeadAuthoritySurface {
  surface_id: string;
  kind: LiveHeadAuthoritySurfaceKind;
  branch: string;
  head_sha?: string;
  status?: LiveHeadAuthorityStatus;
  mergeable?: boolean | null;
  evidence: string[];
}

export interface LiveHeadAuthorityCandidate {
  requested_action: LiveHeadAuthorityWindowActionRequest;
  branch: string;
  base_head_sha: string;
  changed_files: string[];
  behavior_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  exact_blocker?: string;
}

export interface LiveHeadAuthorityWindowInput {
  active_branch: string;
  live_head_sha: string;
  authority_window_id: string;
  spent_authority_window_ids: string[];
  stale_head_shas: string[];
  surfaces: LiveHeadAuthoritySurface[];
  candidate: LiveHeadAuthorityCandidate;
}

export interface LiveHeadAuthorityWindowVerdict {
  ok: boolean;
  action: LiveHeadAuthorityWindowAction;
  branch: string;
  head_sha: string;
  authority_window_id: string | null;
  accepted_surface_ids: string[];
  stale_surface_ids: string[];
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

const NON_PROGRESS_ACTIONS = new Set<LiveHeadAuthorityWindowActionRequest>([
  "metadata_reread",
  "duplicate_ci_summary",
  "warning_maintenance",
]);

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function behaviorPath(path: string): boolean {
  return (
    executablePlatformPath(path) &&
    path !== "platform/packages/route-governor/package.json" &&
    path !== "platform/packages/route-governor/src/index.ts" &&
    !/(?:\.test|-proof)\.ts$/.test(path)
  );
}

function onLiveHead(input: LiveHeadAuthorityWindowInput, surface: LiveHeadAuthoritySurface): boolean {
  return surface.branch === input.active_branch && surface.head_sha === input.live_head_sha;
}

function liveMetadata(input: LiveHeadAuthorityWindowInput): LiveHeadAuthoritySurface[] {
  return input.surfaces.filter((surface) => surface.kind === "live_pr_metadata" && onLiveHead(input, surface));
}

function liveStatus(input: LiveHeadAuthorityWindowInput): LiveHeadAuthoritySurface[] {
  return input.surfaces.filter((surface) => surface.kind === "direct_status_surface" && onLiveHead(input, surface));
}

function liveMergeability(input: LiveHeadAuthorityWindowInput): LiveHeadAuthoritySurface[] {
  return input.surfaces.filter(
    (surface) =>
      (surface.kind === "live_pr_metadata" || surface.kind === "mergeability_metadata") && onLiveHead(input, surface),
  );
}

function acceptedSurfaceIds(input: LiveHeadAuthorityWindowInput): string[] {
  return input.surfaces.filter((surface) => onLiveHead(input, surface)).map((surface) => surface.surface_id);
}

function staleSurfaceIds(input: LiveHeadAuthorityWindowInput): string[] {
  const staleHeads = new Set(input.stale_head_shas.filter((head) => head !== input.live_head_sha));
  return input.surfaces
    .filter((surface) => Boolean(surface.head_sha) && surface.head_sha !== input.live_head_sha)
    .filter((surface) => staleHeads.size === 0 || staleHeads.has(surface.head_sha ?? ""))
    .map((surface) => surface.surface_id);
}

function warnings(input: LiveHeadAuthorityWindowInput): string[] {
  return input.surfaces
    .filter((surface) => onLiveHead(input, surface) && surface.status === "passing_with_warnings")
    .flatMap((surface) => surface.evidence.filter((item) => /warning|notice/i.test(item)));
}

function base(input: LiveHeadAuthorityWindowInput): Pick<
  LiveHeadAuthorityWindowVerdict,
  "branch" | "head_sha" | "authority_window_id" | "accepted_surface_ids" | "stale_surface_ids" | "warnings"
> {
  return {
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    authority_window_id: input.authority_window_id.trim() || null,
    accepted_surface_ids: acceptedSurfaceIds(input),
    stale_surface_ids: staleSurfaceIds(input),
    warnings: warnings(input),
  };
}

function block(
  input: LiveHeadAuthorityWindowInput,
  action: Exclude<
    LiveHeadAuthorityWindowAction,
    | "admit_live_head_embodiment"
    | "admit_live_status_readback"
    | "admit_review_or_merge_authority"
    | "emit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): LiveHeadAuthorityWindowVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function requireWindow(input: LiveHeadAuthorityWindowInput): LiveHeadAuthorityWindowVerdict | null {
  const windowId = input.authority_window_id.trim();
  if (!windowId || input.spent_authority_window_ids.includes(windowId)) {
    return block(
      input,
      "block_reused_window",
      [windowId ? `live-head authority window already spent: ${windowId}` : "live-head authority window has no id"],
      "issue a fresh authority window id for this live PR head",
      [`live head ${input.live_head_sha}`],
    );
  }
  return null;
}

function passingStatus(surface: LiveHeadAuthoritySurface): boolean {
  return surface.status === "passing" || surface.status === "passing_with_warnings";
}

function embodimentBlockers(candidate: LiveHeadAuthorityCandidate): string[] {
  const blockers: string[] = [];
  if (!candidate.changed_files.some(behaviorPath)) blockers.push("authority-window embodiment changes no behavior-bearing platform file");
  if (candidate.behavior_artifacts.length === 0) blockers.push("authority-window embodiment has no behavior artifact");
  if (candidate.routing_artifacts.length === 0) blockers.push("authority-window embodiment has no future-routing artifact");
  if (candidate.proof_artifacts.length === 0) blockers.push("authority-window embodiment has no proof artifact");
  return blockers;
}

export function openLiveHeadAuthorityWindow(
  input: LiveHeadAuthorityWindowInput,
): LiveHeadAuthorityWindowVerdict {
  const windowBlock = requireWindow(input);
  if (windowBlock) return windowBlock;

  const candidate = input.candidate;
  const routeEvidence = [`authority window ${input.authority_window_id}`, `live head ${input.live_head_sha}`];

  if (candidate.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`],
      "bind the candidate to the active PR branch before consuming live-head authority",
      routeEvidence,
    );
  }

  const metadata = liveMetadata(input);
  if (metadata.length === 0) {
    return block(
      input,
      "block_missing_live_metadata",
      [`no live PR metadata is bound to ${input.active_branch}@${input.live_head_sha}`],
      "read live PR metadata before trusting prompt, PR body, memory, status, review, or merge claims",
      routeEvidence,
    );
  }

  if (candidate.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_candidate_base",
      [`candidate base ${candidate.base_head_sha} is not live PR head ${input.live_head_sha}`],
      "rebase the action to the live PR head and keep prompt/body heads as historical only",
      [...routeEvidence, ...metadata.flatMap((surface) => surface.evidence)],
    );
  }

  if (NON_PROGRESS_ACTIONS.has(candidate.requested_action)) {
    return block(
      input,
      "block_non_progress_action",
      [`${candidate.requested_action} cannot consume live-head authority as progress`],
      "choose behavior-bearing embodiment, live status readback, review/merge authority, or one exact blocker",
      [...routeEvidence, candidate.requested_action],
    );
  }

  if (candidate.requested_action === "exact_external_blocker") {
    const blocker = candidate.exact_blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_missing_exact_blocker",
        ["live-head authority exact-blocker action has no blocker text"],
        "name the exact live-head blocker before release",
        routeEvidence,
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_exact_external_blocker",
      decisive_evidence: [...routeEvidence, blocker],
      blockers: [blocker],
      next_route: "resolve the named live-head blocker before consuming review, merge, or embodiment authority",
    };
  }

  const statusSurfaces = liveStatus(input);
  const failingStatus = statusSurfaces.find((surface) => surface.status === "failing");
  if (failingStatus) {
    return block(
      input,
      "block_failing_live_status",
      failingStatus.evidence.length > 0 ? failingStatus.evidence : [`live status failed on ${failingStatus.surface_id}`],
      "repair only the live-head failing status before review, merge, or another embodiment consumes authority",
      [...routeEvidence, failingStatus.surface_id, ...failingStatus.evidence],
    );
  }

  if (candidate.requested_action === "fresh_status_readback") {
    const status = statusSurfaces.find((surface) => passingStatus(surface));
    if (!status) {
      const pending = statusSurfaces.find((surface) => surface.status === "pending" || surface.status === "unknown");
      return block(
        input,
        pending ? "block_pending_live_status" : "block_missing_live_status",
        pending
          ? pending.evidence.length > 0
            ? pending.evidence
            : [`live status is ${pending.status} on ${pending.surface_id}`]
          : ["fresh status readback has no direct status surface for the live PR head"],
        "obtain direct status for the live PR head before counting status readback progress",
        pending ? [...routeEvidence, pending.surface_id, ...pending.evidence] : routeEvidence,
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_live_status_readback",
      decisive_evidence: [...routeEvidence, status.surface_id, ...status.evidence],
      blockers: [],
      next_route: "use this live-head status surface once; future branch movement expires this authority window",
    };
  }

  if (candidate.requested_action === "review_request" || candidate.requested_action === "merge_command") {
    const status = statusSurfaces.find((surface) => passingStatus(surface));
    if (!status) {
      return block(
        input,
        statusSurfaces.length > 0 ? "block_pending_live_status" : "block_missing_live_status",
        statusSurfaces.length > 0
          ? statusSurfaces.flatMap((surface) => surface.evidence)
          : [`${candidate.requested_action} requires direct passing status for live head ${input.live_head_sha}`],
        "assemble direct live-head status before review or merge authority can open",
        routeEvidence,
      );
    }

    const mergeability = liveMergeability(input).find((surface) => surface.mergeable !== undefined && surface.mergeable !== null);
    if (!mergeability) {
      return block(
        input,
        "block_missing_mergeability",
        [`${candidate.requested_action} requires live-head mergeability metadata`],
        "read mergeability from live PR metadata before review or merge authority can open",
        [...routeEvidence, status.surface_id],
      );
    }
    if (!mergeability.mergeable) {
      return block(
        input,
        "block_unmergeable_live_head",
        [`live PR head ${input.live_head_sha} is not mergeable`],
        "repair mergeability before review or merge authority can open",
        [...routeEvidence, mergeability.surface_id, ...mergeability.evidence],
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_review_or_merge_authority",
      decisive_evidence: [
        ...routeEvidence,
        `requested ${candidate.requested_action}`,
        status.surface_id,
        mergeability.surface_id,
        ...status.evidence,
        ...mergeability.evidence,
      ],
      blockers: [],
      next_route: "consume review or merge authority only while status and mergeability remain bound to this exact live head",
    };
  }

  const blockers = embodimentBlockers(candidate);
  if (blockers.length > 0) {
    return block(
      input,
      "block_incomplete_embodiment",
      blockers,
      "supply a behavior-bearing platform write, proof, and future-routing artifact before moving the branch",
      [...routeEvidence, ...metadata.flatMap((surface) => surface.evidence)],
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_live_head_embodiment",
    decisive_evidence: [
      ...routeEvidence,
      ...metadata.flatMap((surface) => surface.evidence),
      ...candidate.changed_files.filter(behaviorPath),
      ...candidate.behavior_artifacts,
      ...candidate.routing_artifacts,
      ...candidate.proof_artifacts,
    ],
    blockers: [],
    next_route: "write the embodiment on the live head, then expire this authority window and require status on the moved result head",
  };
}
