export type PromptCarriedHeadNextAction =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "repaired_head_blocker"
  | "duplicate_status_summary"
  | "metadata_reread"
  | "duplicate_comment"
  | "local_memory_guard";

export type PromptCarriedHeadAuthorityAction =
  | "route_to_live_head_embodiment"
  | "route_to_fresh_live_head_status"
  | "emit_exact_external_blocker"
  | "block_resolved_boundary_replay"
  | "block_stale_prompt_head_authority"
  | "block_non_progress_action"
  | "block_missing_live_head"
  | "block_missing_prompt_head"
  | "block_missing_exact_blocker";

export interface ResolvedHeadBoundary {
  head_sha: string;
  status_readback_surfaced: boolean;
  blocker_retired: boolean;
  evidence: string[];
}

export interface PromptCarriedHeadAuthorityInput {
  branch: string;
  prompt_carried_head_sha: string;
  live_head_sha: string;
  resolved_boundaries: ResolvedHeadBoundary[];
  requested_next_action: PromptCarriedHeadNextAction;
  exact_blocker?: string;
}

export interface PromptCarriedHeadAuthorityVerdict {
  ok: boolean;
  action: PromptCarriedHeadAuthorityAction;
  branch: string;
  prompt_carried_head_sha: string | null;
  live_head_sha: string | null;
  authority_head_sha: string | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_ACTIONS = new Set<PromptCarriedHeadNextAction>([
  "duplicate_status_summary",
  "metadata_reread",
  "duplicate_comment",
  "local_memory_guard",
]);

function normalized(value: string): string {
  return value.trim();
}

function resolvedBoundaryFor(
  headSha: string,
  boundaries: ResolvedHeadBoundary[],
): ResolvedHeadBoundary | undefined {
  return boundaries.find(
    (boundary) =>
      normalized(boundary.head_sha) === headSha &&
      boundary.status_readback_surfaced &&
      boundary.blocker_retired,
  );
}

function base(input: PromptCarriedHeadAuthorityInput): Pick<
  PromptCarriedHeadAuthorityVerdict,
  "branch" | "prompt_carried_head_sha" | "live_head_sha"
> {
  return {
    branch: input.branch,
    prompt_carried_head_sha: normalized(input.prompt_carried_head_sha) || null,
    live_head_sha: normalized(input.live_head_sha) || null,
  };
}

function block(
  input: PromptCarriedHeadAuthorityInput,
  action: Exclude<
    PromptCarriedHeadAuthorityAction,
    "route_to_live_head_embodiment" | "route_to_fresh_live_head_status" | "emit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): PromptCarriedHeadAuthorityVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    authority_head_sha: null,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

export function resolvePromptCarriedHeadAuthority(
  input: PromptCarriedHeadAuthorityInput,
): PromptCarriedHeadAuthorityVerdict {
  const promptHead = normalized(input.prompt_carried_head_sha);
  const liveHead = normalized(input.live_head_sha);

  if (!promptHead) {
    return block(
      input,
      "block_missing_prompt_head",
      ["prompt-carried head sha is missing"],
      "read the current instruction boundary before selecting a finalization route",
    );
  }

  if (!liveHead) {
    return block(
      input,
      "block_missing_live_head",
      ["live PR head sha is missing"],
      "read the live PR head before consuming prompt-carried head authority",
      [`prompt head ${promptHead}`],
    );
  }

  const resolvedBoundary = resolvedBoundaryFor(promptHead, input.resolved_boundaries);
  const headMovedBeyondPrompt = promptHead !== liveHead;
  const evidence = [
    `branch ${input.branch}`,
    `prompt head ${promptHead}`,
    `live head ${liveHead}`,
    ...(resolvedBoundary ? resolvedBoundary.evidence : []),
  ];

  if (NON_PROGRESS_ACTIONS.has(input.requested_next_action)) {
    return block(
      input,
      "block_non_progress_action",
      [`${input.requested_next_action} cannot consume prompt-carried head authority as progress`],
      "choose live-head embodiment, fresh live-head status when allowed, or an exact blocker",
      evidence,
    );
  }

  if (input.requested_next_action === "repaired_head_blocker") {
    if (resolvedBoundary) {
      return block(
        input,
        "block_resolved_boundary_replay",
        [`repaired-head blocker for ${promptHead} is already retired`],
        "route from the live PR head; do not resurrect the resolved repaired-head blocker",
        evidence,
      );
    }

    return block(
      input,
      "block_stale_prompt_head_authority",
      [`prompt-carried head ${promptHead} is not a resolved retired boundary`],
      "name a current external blocker bound to the live PR head",
      evidence,
    );
  }

  if (input.requested_next_action === "exact_external_blocker") {
    const blocker = input.exact_blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_missing_exact_blocker",
        ["exact external blocker action has no blocker text"],
        "provide a live-head-bound external blocker or choose executable embodiment",
        evidence,
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_exact_external_blocker",
      authority_head_sha: liveHead,
      decisive_evidence: [...evidence, blocker],
      blockers: [blocker],
      next_route: "remove the live-head-bound blocker before another embodiment route is admitted",
    };
  }

  if (input.requested_next_action === "fresh_status_readback") {
    if (!headMovedBeyondPrompt) {
      return block(
        input,
        "block_stale_prompt_head_authority",
        [`prompt head ${promptHead} has not moved beyond the live head`],
        "fresh status readback needs a moved live head or new live-head checks",
        evidence,
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "route_to_fresh_live_head_status",
      authority_head_sha: liveHead,
      decisive_evidence: [...evidence, `head moved beyond prompt-carried boundary ${promptHead}`],
      blockers: [],
      next_route: "read status only from checks bound to the live PR head",
    };
  }

  if (headMovedBeyondPrompt && !resolvedBoundary) {
    return block(
      input,
      "block_stale_prompt_head_authority",
      [`prompt head ${promptHead} differs from live head ${liveHead} without a resolved-boundary receipt`],
      "classify the prompt-carried head as resolved or bind the next route to the live head explicitly",
      evidence,
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "route_to_live_head_embodiment",
    authority_head_sha: liveHead,
    decisive_evidence: resolvedBoundary
      ? [...evidence, `resolved prompt boundary ${promptHead} yields to live head ${liveHead}`]
      : [...evidence, "prompt-carried head already equals live head"],
    blockers: [],
    next_route: "write the next executable embodiment against the live PR head and require post-write status on the moved head",
  };
}
