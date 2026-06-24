export type PostEmbodimentCandidateClass =
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "external_platform_embodiment"
  | "merge_attempt"
  | "review_request"
  | "metadata_reread"
  | "duplicate_ci_summary"
  | "duplicate_comment"
  | "local_memory_guard";

export type PostEmbodimentStatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "unknown";

export type PostEmbodimentNextRouteAction =
  | "require_new_head_status_readback"
  | "admit_head_bound_status_surface"
  | "emit_exact_external_blocker"
  | "block_branch_mismatch"
  | "block_stale_candidate_base"
  | "block_repeated_non_progress"
  | "block_status_before_head_move"
  | "block_status_gated_progress"
  | "block_missing_exact_blocker";

export interface PostEmbodimentStatusSurface {
  surface_id: string;
  head_sha: string;
  verdict: PostEmbodimentStatusVerdict;
  evidence: string[];
}

export interface PostEmbodimentNextRouteCandidate {
  candidate_class: PostEmbodimentCandidateClass;
  branch: string;
  base_head_sha: string;
  blocker?: string;
}

export interface PostEmbodimentNextRouteInput {
  active_branch: string;
  previous_head_sha: string;
  committed_head_sha: string;
  last_status_readback_head_sha: string;
  status_surfaces: PostEmbodimentStatusSurface[];
  candidate: PostEmbodimentNextRouteCandidate;
}

export interface PostEmbodimentNextRouteVerdict {
  ok: boolean;
  action: PostEmbodimentNextRouteAction;
  branch: string;
  head_sha: string;
  accepted_status_surfaces: string[];
  stale_status_surfaces: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_CLASSES = new Set<PostEmbodimentCandidateClass>([
  "metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "local_memory_guard",
]);

const STATUS_GATED_CLASSES = new Set<PostEmbodimentCandidateClass>([
  "external_platform_embodiment",
  "merge_attempt",
  "review_request",
]);

function liveSurfaces(input: PostEmbodimentNextRouteInput): PostEmbodimentStatusSurface[] {
  return input.status_surfaces.filter((surface) => surface.head_sha === input.committed_head_sha);
}

function staleSurfaces(input: PostEmbodimentNextRouteInput): PostEmbodimentStatusSurface[] {
  return input.status_surfaces.filter((surface) => surface.head_sha !== input.committed_head_sha);
}

function base(input: PostEmbodimentNextRouteInput): Pick<
  PostEmbodimentNextRouteVerdict,
  "branch" | "head_sha" | "accepted_status_surfaces" | "stale_status_surfaces"
> {
  return {
    branch: input.active_branch,
    head_sha: input.committed_head_sha,
    accepted_status_surfaces: liveSurfaces(input).map((surface) => surface.surface_id),
    stale_status_surfaces: staleSurfaces(input).map((surface) => surface.surface_id),
  };
}

function block(
  input: PostEmbodimentNextRouteInput,
  action: Exclude<
    PostEmbodimentNextRouteAction,
    "require_new_head_status_readback" | "admit_head_bound_status_surface" | "emit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): PostEmbodimentNextRouteVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function headMoved(input: PostEmbodimentNextRouteInput): boolean {
  return input.committed_head_sha !== input.previous_head_sha;
}

function statusAlreadyRead(input: PostEmbodimentNextRouteInput): boolean {
  return input.last_status_readback_head_sha === input.committed_head_sha;
}

export function routeAfterEmbodimentCommit(
  input: PostEmbodimentNextRouteInput,
): PostEmbodimentNextRouteVerdict {
  const candidate = input.candidate;

  if (candidate.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`],
      "bind post-embodiment routing to the active PR branch",
    );
  }

  if (candidate.base_head_sha !== input.committed_head_sha) {
    return block(
      input,
      "block_stale_candidate_base",
      [`candidate base ${candidate.base_head_sha} is not committed head ${input.committed_head_sha}`],
      "rebase the post-embodiment route candidate to the branch head created by the embodiment commit",
      [`previous head ${input.previous_head_sha}`, `committed head ${input.committed_head_sha}`],
    );
  }

  if (NON_PROGRESS_CLASSES.has(candidate.candidate_class)) {
    return block(
      input,
      "block_repeated_non_progress",
      [`post-embodiment candidate is non-progress: ${candidate.candidate_class}`],
      "choose new-head status readback or one exact external blocker before any further route",
    );
  }

  if (candidate.candidate_class === "exact_external_blocker") {
    const blocker = candidate.blocker?.trim();
    if (!blocker || !blocker.includes(input.committed_head_sha)) {
      return block(
        input,
        "block_missing_exact_blocker",
        ["exact blocker must name the committed PR head it blocks"],
        "name one exact external blocker bound to the committed head",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_exact_external_blocker",
      decisive_evidence: [blocker],
      blockers: [blocker],
      next_route: "clear the named committed-head blocker before another finalization progress class",
    };
  }

  if (!headMoved(input)) {
    return block(
      input,
      "block_status_before_head_move",
      ["post-embodiment routing requires a committed head that differs from the previous head"],
      "move the PR branch with an executable embodiment before post-embodiment status routing",
    );
  }

  if (STATUS_GATED_CLASSES.has(candidate.candidate_class) && !statusAlreadyRead(input)) {
    return block(
      input,
      "block_status_gated_progress",
      [`${candidate.candidate_class} is blocked until status is read for ${input.committed_head_sha}`],
      "perform a status readback bound to the committed head before merge, review, or another embodiment",
      liveSurfaces(input).flatMap((surface) => [surface.surface_id, ...surface.evidence]),
    );
  }

  if (candidate.candidate_class === "fresh_status_readback") {
    if (statusAlreadyRead(input) && liveSurfaces(input).length === 0) {
      return block(
        input,
        "block_status_before_head_move",
        [`status has already been read for committed head ${input.committed_head_sha}`],
        "do not duplicate status readback until the head moves again or a new current-head status surface appears",
      );
    }

    const surfaces = liveSurfaces(input);
    if (surfaces.length > 0) {
      return {
        ...base(input),
        ok: true,
        action: "admit_head_bound_status_surface",
        decisive_evidence: surfaces.flatMap((surface) => [surface.surface_id, surface.verdict, ...surface.evidence]),
        blockers: surfaces
          .filter((surface) => surface.verdict === "failing")
          .map((surface) => `failing committed-head status surface: ${surface.surface_id}`),
        next_route: "route from the committed-head status verdict; ignore stale status surfaces from earlier heads",
      };
    }

    return {
      ...base(input),
      ok: true,
      action: "require_new_head_status_readback",
      decisive_evidence: [
        `head moved from ${input.previous_head_sha} to ${input.committed_head_sha}`,
        `last status readback head ${input.last_status_readback_head_sha}`,
      ],
      blockers: [],
      next_route: "obtain a status surface for the committed head before merge, review, or another embodiment",
    };
  }

  return block(
    input,
    "block_status_gated_progress",
    [`unsupported post-embodiment candidate before status: ${candidate.candidate_class}`],
    "perform committed-head status readback or emit one exact committed-head blocker",
  );
}
