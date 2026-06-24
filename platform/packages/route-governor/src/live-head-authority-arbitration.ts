export type LiveHeadAuthoritySurfaceKind =
  | "live_pr_metadata"
  | "direct_status_surface"
  | "pr_body_summary"
  | "prompt_instruction"
  | "memory_receipt";

export type LiveHeadAuthorityStatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "unknown";

export type LiveHeadAuthorityMoveClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "duplicate_ci_summary"
  | "metadata_reread";

export type LiveHeadAuthorityAction =
  | "admit_live_authority_embodiment"
  | "admit_live_status_readback"
  | "emit_exact_external_blocker"
  | "block_branch_mismatch"
  | "block_missing_live_metadata"
  | "block_stale_candidate_base"
  | "block_non_progress_move"
  | "block_untrusted_authority_surface"
  | "block_incomplete_candidate";

export interface LiveHeadAuthoritySurface {
  surface_id: string;
  kind: LiveHeadAuthoritySurfaceKind;
  branch: string;
  head_sha?: string;
  status_verdict?: LiveHeadAuthorityStatusVerdict;
  evidence: string[];
}

export interface LiveHeadAuthorityCandidate {
  move_class: LiveHeadAuthorityMoveClass;
  branch: string;
  base_head_sha: string;
  authority_surface_ids: string[];
  changed_files: string[];
  behavior_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  blocker?: string;
}

export interface LiveHeadAuthorityInput {
  active_branch: string;
  live_head_sha: string;
  last_status_readback_head_sha?: string;
  resolved_historical_heads: string[];
  surfaces: LiveHeadAuthoritySurface[];
  candidate: LiveHeadAuthorityCandidate;
}

export interface LiveHeadAuthorityVerdict {
  ok: boolean;
  action: LiveHeadAuthorityAction;
  branch: string;
  head_sha: string;
  accepted_authority_surface_ids: string[];
  rejected_authority_surface_ids: string[];
  historical_head_shas: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const SUMMARY_SURFACES = new Set<LiveHeadAuthoritySurfaceKind>(["pr_body_summary", "prompt_instruction", "memory_receipt"]);
const NON_PROGRESS_MOVES = new Set<LiveHeadAuthorityMoveClass>(["duplicate_ci_summary", "metadata_reread"]);

function executableBehaviorPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    /\.(ts|js|mjs|json)$/.test(path) &&
    !/(?:\.test|-proof)\.ts$/.test(path) &&
    !path.endsWith("/package.json") &&
    !path.endsWith("/src/index.ts")
  );
}

function base(input: LiveHeadAuthorityInput): Pick<
  LiveHeadAuthorityVerdict,
  "branch" | "head_sha" | "historical_head_shas"
> {
  return {
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    historical_head_shas: [
      ...new Set(
        [input.last_status_readback_head_sha, ...input.resolved_historical_heads].filter(
          (head): head is string => Boolean(head) && head !== input.live_head_sha,
        ),
      ),
    ],
  };
}

function isAcceptedLiveAuthority(input: LiveHeadAuthorityInput, surface: LiveHeadAuthoritySurface): boolean {
  return (
    surface.branch === input.active_branch &&
    surface.head_sha === input.live_head_sha &&
    !SUMMARY_SURFACES.has(surface.kind) &&
    (surface.kind === "live_pr_metadata" || surface.kind === "direct_status_surface")
  );
}

function authoritySurfaces(input: LiveHeadAuthorityInput): LiveHeadAuthoritySurface[] {
  const ids = new Set(input.candidate.authority_surface_ids);
  return input.surfaces.filter((surface) => ids.has(surface.surface_id));
}

function rejectedAuthoritySurfaces(input: LiveHeadAuthorityInput): LiveHeadAuthoritySurface[] {
  return authoritySurfaces(input).filter((surface) => !isAcceptedLiveAuthority(input, surface));
}

function missingAuthorityIds(input: LiveHeadAuthorityInput): string[] {
  const known = new Set(input.surfaces.map((surface) => surface.surface_id));
  return input.candidate.authority_surface_ids.filter((surfaceId) => !known.has(surfaceId));
}

function liveMetadata(input: LiveHeadAuthorityInput): LiveHeadAuthoritySurface[] {
  return input.surfaces.filter(
    (surface) => surface.kind === "live_pr_metadata" && isAcceptedLiveAuthority(input, surface),
  );
}

function acceptedAuthorityIds(input: LiveHeadAuthorityInput): string[] {
  return authoritySurfaces(input)
    .filter((surface) => isAcceptedLiveAuthority(input, surface))
    .map((surface) => surface.surface_id);
}

function block(
  input: LiveHeadAuthorityInput,
  action: Exclude<
    LiveHeadAuthorityAction,
    "admit_live_authority_embodiment" | "admit_live_status_readback" | "emit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): LiveHeadAuthorityVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    accepted_authority_surface_ids: acceptedAuthorityIds(input),
    rejected_authority_surface_ids: [
      ...rejectedAuthoritySurfaces(input).map((surface) => surface.surface_id),
      ...missingAuthorityIds(input),
    ],
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function incompleteEmbodiment(input: LiveHeadAuthorityInput): string[] {
  const candidate = input.candidate;
  const blockers: string[] = [];

  if (candidate.authority_surface_ids.length === 0) blockers.push("candidate cites no live authority surface ids");
  if (!candidate.changed_files.some(executableBehaviorPath)) {
    blockers.push("candidate changes no behavior-bearing platform file");
  }
  if (candidate.behavior_artifacts.length === 0) blockers.push("candidate has no behavior artifact evidence");
  if (candidate.routing_artifacts.length === 0) blockers.push("candidate has no future-routing artifact evidence");
  if (candidate.proof_artifacts.length === 0) blockers.push("candidate has no proof artifact evidence");

  return blockers;
}

export function arbitrateLiveHeadAuthority(input: LiveHeadAuthorityInput): LiveHeadAuthorityVerdict {
  const candidate = input.candidate;

  if (candidate.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`],
      "bind the candidate to the active PR branch before release",
    );
  }

  const metadata = liveMetadata(input);
  if (metadata.length === 0) {
    return block(
      input,
      "block_missing_live_metadata",
      [`no live PR metadata authority surface is bound to ${input.active_branch}@${input.live_head_sha}`],
      "read live PR metadata before allowing PR-body, prompt, or memory surfaces to influence release",
    );
  }

  if (candidate.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_candidate_base",
      [`candidate base ${candidate.base_head_sha} is not live head ${input.live_head_sha}`],
      "rebase the candidate to the live PR head before citing any authority surface",
      metadata.flatMap((surface) => surface.evidence),
    );
  }

  if (NON_PROGRESS_MOVES.has(candidate.move_class)) {
    return block(
      input,
      "block_non_progress_move",
      [`candidate move class cannot carry live authority: ${candidate.move_class}`],
      "choose a behavior-bearing embodiment, fresh live-head status readback, or exact blocker",
    );
  }

  const missingIds = missingAuthorityIds(input);
  const rejected = rejectedAuthoritySurfaces(input);
  if (missingIds.length > 0 || rejected.length > 0) {
    return block(
      input,
      "block_untrusted_authority_surface",
      [
        ...missingIds.map((surfaceId) => `candidate cites missing authority surface: ${surfaceId}`),
        ...rejected.map(
          (surface) =>
            `candidate cites non-live or summary authority surface: ${surface.surface_id}:${surface.kind}@${surface.head_sha ?? "<no-head>"}`,
        ),
      ],
      "cite only direct live PR metadata or direct live-head status surfaces as release authority; quarantine PR-body, prompt, memory, and stale-head claims",
      rejected.flatMap((surface) => [surface.surface_id, ...surface.evidence]),
    );
  }

  if (candidate.move_class === "fresh_status_readback") {
    const directStatus = authoritySurfaces(input).filter((surface) => surface.kind === "direct_status_surface");
    if (directStatus.length === 0) {
      return block(
        input,
        "block_untrusted_authority_surface",
        ["fresh status readback cites no direct live-head status surface"],
        "attach a direct status surface for the live head before claiming readback progress",
        metadata.flatMap((surface) => surface.evidence),
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_live_status_readback",
      accepted_authority_surface_ids: acceptedAuthorityIds(input),
      rejected_authority_surface_ids: [],
      decisive_evidence: directStatus.flatMap((surface) => [surface.surface_id, ...surface.evidence]),
      blockers: [],
      next_route: "publish only the direct live-head status readback, then require a non-repeated embodiment or exact blocker",
    };
  }

  if (candidate.move_class === "exact_external_blocker") {
    const blocker = candidate.blocker?.trim();
    return {
      ...base(input),
      ok: Boolean(blocker),
      action: "emit_exact_external_blocker",
      accepted_authority_surface_ids: acceptedAuthorityIds(input),
      rejected_authority_surface_ids: [],
      decisive_evidence: blocker ? [blocker, ...metadata.flatMap((surface) => surface.evidence)] : [],
      blockers: blocker ? [blocker] : ["exact external blocker candidate has no blocker text"],
      next_route: blocker
        ? "remove the named live-head blocker before another progress claim"
        : "name the exact blocker or choose a live-authority embodiment candidate",
    };
  }

  const incomplete = incompleteEmbodiment(input);
  if (incomplete.length > 0) {
    return block(
      input,
      "block_incomplete_candidate",
      incomplete,
      "complete behavior, routing, proof, and live authority surface evidence before moving the branch",
      metadata.flatMap((surface) => surface.evidence),
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_live_authority_embodiment",
    accepted_authority_surface_ids: acceptedAuthorityIds(input),
    rejected_authority_surface_ids: [],
    decisive_evidence: [
      ...authoritySurfaces(input).flatMap((surface) => [surface.surface_id, ...surface.evidence]),
      ...candidate.changed_files.filter(executableBehaviorPath),
      ...candidate.behavior_artifacts,
      ...candidate.routing_artifacts,
      ...candidate.proof_artifacts,
    ],
    blockers: [],
    next_route:
      "commit the behavior-bearing embodiment against the live head; the next status claim must cite only the resulting head's direct status surface",
  };
}
