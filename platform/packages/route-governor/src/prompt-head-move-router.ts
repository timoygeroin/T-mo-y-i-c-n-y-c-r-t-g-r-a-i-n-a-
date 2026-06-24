export type PromptHeadSurfaceKind =
  | "scheduled_prompt"
  | "user_instruction"
  | "pr_metadata"
  | "direct_status_surface"
  | "pr_body_summary";

export type PromptHeadMoveAction =
  | "require_fresh_status_readback"
  | "admit_live_head_status_surface"
  | "admit_same_head_continuation"
  | "block_repaired_head_blocker_reuse"
  | "block_missing_live_head"
  | "block_branch_mismatch";

export interface PromptHeadSurface {
  surface_id: string;
  kind: PromptHeadSurfaceKind;
  branch: string;
  head_sha?: string;
  evidence: string[];
}

export interface PromptHeadMoveRouterInput {
  active_branch: string;
  expected_branch: string;
  live_head_sha?: string;
  prompt_head_sha: string;
  last_repaired_head_sha: string;
  last_status_readback_head_sha?: string;
  surfaces: PromptHeadSurface[];
  requested_progress_class: "external_platform_embodiment" | "fresh_status_readback" | "repaired_head_blocker";
}

export interface PromptHeadMoveRouterVerdict {
  ok: boolean;
  action: PromptHeadMoveAction;
  branch: string;
  head_sha: string | null;
  accepted_surface_ids: string[];
  stale_surface_ids: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function base(input: PromptHeadMoveRouterInput): Pick<PromptHeadMoveRouterVerdict, "branch" | "head_sha"> {
  return { branch: input.active_branch, head_sha: input.live_head_sha ?? null };
}

function onLiveHead(input: PromptHeadMoveRouterInput, surface: PromptHeadSurface): boolean {
  return Boolean(input.live_head_sha) && surface.branch === input.active_branch && surface.head_sha === input.live_head_sha;
}

function acceptedSurfaces(input: PromptHeadMoveRouterInput): PromptHeadSurface[] {
  return input.surfaces.filter((surface) => onLiveHead(input, surface));
}

function staleSurfaces(input: PromptHeadMoveRouterInput): PromptHeadSurface[] {
  return input.surfaces.filter(
    (surface) => Boolean(surface.head_sha) && Boolean(input.live_head_sha) && surface.head_sha !== input.live_head_sha,
  );
}

function block(
  input: PromptHeadMoveRouterInput,
  action: Exclude<
    PromptHeadMoveAction,
    "require_fresh_status_readback" | "admit_live_head_status_surface" | "admit_same_head_continuation"
  >,
  blockers: string[],
  nextRoute: string,
  decisiveEvidence: string[] = [],
): PromptHeadMoveRouterVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    accepted_surface_ids: acceptedSurfaces(input).map((surface) => surface.surface_id),
    stale_surface_ids: staleSurfaces(input).map((surface) => surface.surface_id),
    decisive_evidence: decisiveEvidence,
    blockers,
    next_route: nextRoute,
  };
}

function liveStatusSurfaces(input: PromptHeadMoveRouterInput): PromptHeadSurface[] {
  return acceptedSurfaces(input).filter((surface) => surface.kind === "direct_status_surface");
}

export function routePromptHeadMove(input: PromptHeadMoveRouterInput): PromptHeadMoveRouterVerdict {
  if (input.active_branch !== input.expected_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`active branch ${input.active_branch} does not match expected branch ${input.expected_branch}`],
      "bind prompt-head routing to the active PR branch before choosing finalization progress",
    );
  }

  if (!input.live_head_sha) {
    return block(
      input,
      "block_missing_live_head",
      ["no live PR head is available for prompt-head reconciliation"],
      "read live PR metadata before trusting prompt, PR-body, or memory head claims",
    );
  }

  const headMovedFromPrompt = input.prompt_head_sha !== input.live_head_sha;
  const statusHeadMoved = input.last_status_readback_head_sha !== input.live_head_sha;
  const liveStatuses = liveStatusSurfaces(input);

  if (input.requested_progress_class === "repaired_head_blocker") {
    return block(
      input,
      "block_repaired_head_blocker_reuse",
      [`repaired-head blocker for ${input.last_repaired_head_sha} cannot be emitted against live head ${input.live_head_sha}`],
      "discard the repaired-head blocker and route only from live-head status or a new executable embodiment",
      [
        `prompt head ${input.prompt_head_sha}`,
        `last repaired head ${input.last_repaired_head_sha}`,
        `live head ${input.live_head_sha}`,
      ],
    );
  }

  if (liveStatuses.length > 0) {
    return {
      ...base(input),
      ok: true,
      action: "admit_live_head_status_surface",
      accepted_surface_ids: acceptedSurfaces(input).map((surface) => surface.surface_id),
      stale_surface_ids: staleSurfaces(input).map((surface) => surface.surface_id),
      decisive_evidence: liveStatuses.flatMap((surface) => [surface.surface_id, ...surface.evidence]),
      blockers: [],
      next_route: "use the direct live-head status surface before choosing repair, review handoff, or the next embodiment",
    };
  }

  if (headMovedFromPrompt || statusHeadMoved || input.requested_progress_class === "fresh_status_readback") {
    return {
      ...base(input),
      ok: true,
      action: "require_fresh_status_readback",
      accepted_surface_ids: acceptedSurfaces(input).map((surface) => surface.surface_id),
      stale_surface_ids: staleSurfaces(input).map((surface) => surface.surface_id),
      decisive_evidence: [
        ...(headMovedFromPrompt ? [`prompt head ${input.prompt_head_sha} differs from live head ${input.live_head_sha}`] : []),
        ...(statusHeadMoved
          ? [`last status readback head ${input.last_status_readback_head_sha ?? "<none>"} differs from live head ${input.live_head_sha}`]
          : []),
      ],
      blockers: [],
      next_route: "obtain a fresh direct status readback for the live PR head before reusing any repaired-head conclusion",
    };
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_same_head_continuation",
    accepted_surface_ids: acceptedSurfaces(input).map((surface) => surface.surface_id),
    stale_surface_ids: staleSurfaces(input).map((surface) => surface.surface_id),
    decisive_evidence: [`prompt head and live head both equal ${input.live_head_sha}`],
    blockers: [],
    next_route: "continue with a non-repeated executable platform embodiment increment",
  };
}
