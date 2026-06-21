export type PostStatusProgressRequestedAction =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "metadata_reread"
  | "duplicate_status_summary"
  | "duplicate_comment"
  | "local_memory_guard"
  | "warning_maintenance"
  | "reclose_blocker_issue";

export type PostStatusConclusion = "success" | "warning_only" | "failure" | "pending" | "no_status";

export type PostStatusProgressAction =
  | "admit_post_status_embodiment"
  | "admit_fresh_status_readback"
  | "emit_exact_external_blocker"
  | "block_branch_mismatch"
  | "block_reused_route"
  | "block_non_progress_action"
  | "block_stale_status_authority"
  | "block_repaired_head_authority"
  | "block_missing_status_delta"
  | "block_missing_embodiment_receipt"
  | "block_stale_embodiment_base"
  | "block_missing_exact_blocker";

export interface PostStatusSurface {
  surface_id: string;
  branch: string;
  head_sha: string;
  conclusion: PostStatusConclusion;
  check_run_ids: string[];
  evidence: string[];
}

export interface PostStatusEmbodimentCandidate {
  branch: string;
  base_head_sha: string;
  changed_files: string[];
  behavior_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  expected_result_head_sha?: string;
}

export interface PostStatusProgressRouterInput {
  active_branch: string;
  live_head_sha: string;
  previous_status_head_sha: string;
  previous_check_run_ids: string[];
  repaired_historical_heads: string[];
  route_id: string;
  spent_route_ids: string[];
  requested_next_action: PostStatusProgressRequestedAction;
  status_surfaces: PostStatusSurface[];
  embodiment_candidate?: PostStatusEmbodimentCandidate;
  exact_blocker?: string;
}

export interface PostStatusProgressRouterVerdict {
  ok: boolean;
  action: PostStatusProgressAction;
  branch: string;
  live_head_sha: string;
  route_id: string | null;
  required_status_head_sha: string | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_ACTIONS = new Set<PostStatusProgressRequestedAction>([
  "metadata_reread",
  "duplicate_status_summary",
  "duplicate_comment",
  "local_memory_guard",
  "warning_maintenance",
  "reclose_blocker_issue",
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

function base(input: PostStatusProgressRouterInput): Pick<
  PostStatusProgressRouterVerdict,
  "branch" | "live_head_sha" | "route_id"
> {
  return {
    branch: input.active_branch,
    live_head_sha: input.live_head_sha,
    route_id: input.route_id.trim() || null,
  };
}

function block(
  input: PostStatusProgressRouterInput,
  action: Exclude<
    PostStatusProgressAction,
    "admit_post_status_embodiment" | "admit_fresh_status_readback" | "emit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): PostStatusProgressRouterVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    required_status_head_sha: null,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function liveStatusSurfaces(input: PostStatusProgressRouterInput): PostStatusSurface[] {
  return input.status_surfaces.filter(
    (surface) => surface.branch === input.active_branch && surface.head_sha === input.live_head_sha,
  );
}

function newCurrentHeadCheckRuns(input: PostStatusProgressRouterInput): string[] {
  const prior = new Set(input.previous_check_run_ids);
  return liveStatusSurfaces(input).flatMap((surface) => surface.check_run_ids.filter((id) => !prior.has(id)));
}

function embodimentBlockers(input: PostStatusProgressRouterInput): string[] {
  const candidate = input.embodiment_candidate;
  const blockers: string[] = [];

  if (!candidate) return ["post-status embodiment route has no embodiment candidate"];
  if (candidate.branch !== input.active_branch) blockers.push(`embodiment branch ${candidate.branch} is not ${input.active_branch}`);
  if (candidate.base_head_sha !== input.live_head_sha) {
    blockers.push(`embodiment base ${candidate.base_head_sha} is not live head ${input.live_head_sha}`);
  }
  if (input.repaired_historical_heads.includes(candidate.base_head_sha)) {
    blockers.push(`embodiment base ${candidate.base_head_sha} is a repaired historical head`);
  }
  if (!candidate.changed_files.some(behaviorPath)) blockers.push("embodiment candidate changes no behavior-bearing platform file");
  if (candidate.behavior_artifacts.length === 0) blockers.push("embodiment candidate has no behavior artifact");
  if (candidate.routing_artifacts.length === 0) blockers.push("embodiment candidate has no future-routing artifact");
  if (candidate.proof_artifacts.length === 0) blockers.push("embodiment candidate has no proof artifact");
  if (candidate.expected_result_head_sha && candidate.expected_result_head_sha === input.live_head_sha) {
    blockers.push("embodiment expected result head must move beyond the live base head");
  }

  return blockers;
}

export function routePostStatusProgress(
  input: PostStatusProgressRouterInput,
): PostStatusProgressRouterVerdict {
  const routeId = input.route_id.trim();
  const routeEvidence = [`route ${routeId || "<missing>"}`, `live head ${input.live_head_sha}`];

  if (!routeId || input.spent_route_ids.includes(routeId)) {
    return block(
      input,
      "block_reused_route",
      [routeId ? `post-status progress route already spent: ${routeId}` : "post-status progress route has no id"],
      "issue a fresh route id before this run can count progress",
      routeEvidence,
    );
  }

  const crossBranchStatus = input.status_surfaces.find((surface) => surface.branch !== input.active_branch);
  if (crossBranchStatus) {
    return block(
      input,
      "block_branch_mismatch",
      [`status surface ${crossBranchStatus.surface_id} is on ${crossBranchStatus.branch}, not ${input.active_branch}`],
      "discard cross-branch status authority before post-status routing",
      [...routeEvidence, crossBranchStatus.surface_id],
    );
  }

  const repairedAuthority = input.status_surfaces.find((surface) => input.repaired_historical_heads.includes(surface.head_sha));
  if (repairedAuthority && repairedAuthority.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_repaired_head_authority",
      [`status surface ${repairedAuthority.surface_id} is bound to repaired historical head ${repairedAuthority.head_sha}`],
      "do not reuse repaired-head status as post-status progress after the PR head moved",
      [...routeEvidence, repairedAuthority.surface_id, ...repairedAuthority.evidence],
    );
  }

  const staleSuccessfulStatus = input.status_surfaces.find(
    (surface) =>
      surface.branch === input.active_branch &&
      surface.head_sha !== input.live_head_sha &&
      (surface.conclusion === "success" || surface.conclusion === "warning_only"),
  );
  if (staleSuccessfulStatus) {
    return block(
      input,
      "block_stale_status_authority",
      [`status surface ${staleSuccessfulStatus.surface_id} is bound to ${staleSuccessfulStatus.head_sha}, not ${input.live_head_sha}`],
      "bind post-status routing to the live head before another progress class consumes it",
      [...routeEvidence, staleSuccessfulStatus.surface_id, ...staleSuccessfulStatus.evidence],
    );
  }

  if (NON_PROGRESS_ACTIONS.has(input.requested_next_action)) {
    return block(
      input,
      "block_non_progress_action",
      [`${input.requested_next_action} is not a valid post-status progress class`],
      "choose external platform embodiment, fresh status readback for a moved/new-check head, or one exact external blocker",
      [...routeEvidence, input.requested_next_action],
    );
  }

  if (input.requested_next_action === "exact_external_blocker") {
    const exactBlocker = input.exact_blocker?.trim();
    if (!exactBlocker) {
      return block(
        input,
        "block_missing_exact_blocker",
        ["exact external blocker action has no blocker text"],
        "name the exact external blocker or choose an admitted progress class",
        routeEvidence,
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_exact_external_blocker",
      required_status_head_sha: null,
      decisive_evidence: [...routeEvidence, exactBlocker],
      blockers: [exactBlocker],
      next_route: "remove the named external blocker before another post-status progress route is admitted",
    };
  }

  if (input.requested_next_action === "fresh_status_readback") {
    const headMoved = input.live_head_sha !== input.previous_status_head_sha;
    const newChecks = newCurrentHeadCheckRuns(input);
    if (!headMoved && newChecks.length === 0) {
      return block(
        input,
        "block_missing_status_delta",
        ["fresh status readback requires a moved PR head or new check runs on the live head"],
        "perform executable embodiment, wait for new live-head checks, or emit the exact external blocker",
        routeEvidence,
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_fresh_status_readback",
      required_status_head_sha: input.live_head_sha,
      decisive_evidence: [
        ...routeEvidence,
        ...(headMoved ? [`head moved from ${input.previous_status_head_sha} to ${input.live_head_sha}`] : []),
        ...newChecks.map((id) => `new live-head check ${id}`),
      ],
      blockers: [],
      next_route: "read status only for the live head named by required_status_head_sha",
    };
  }

  const blockers = embodimentBlockers(input);
  if (blockers.some((item) => item.includes("branch"))) {
    return block(input, "block_branch_mismatch", blockers, "bind the embodiment candidate to the active PR branch", routeEvidence);
  }
  if (blockers.some((item) => item.includes("base"))) {
    return block(input, "block_stale_embodiment_base", blockers, "base the embodiment on the current live PR head", routeEvidence);
  }
  if (blockers.length > 0) {
    return block(
      input,
      "block_missing_embodiment_receipt",
      blockers,
      "supply a behavior-bearing embodiment candidate before moving the branch",
      routeEvidence,
    );
  }

  const candidate = input.embodiment_candidate;
  if (!candidate) throw new Error("unreachable: embodiment candidate checked above");

  return {
    ...base(input),
    ok: true,
    action: "admit_post_status_embodiment",
    required_status_head_sha: candidate.expected_result_head_sha ?? null,
    decisive_evidence: [
      ...routeEvidence,
      ...candidate.changed_files.filter(behaviorPath),
      ...candidate.behavior_artifacts,
      ...candidate.routing_artifacts,
      ...candidate.proof_artifacts,
      ...(candidate.expected_result_head_sha ? [`expected result head ${candidate.expected_result_head_sha}`] : []),
    ],
    blockers: [],
    next_route: "write the admitted embodiment, then require the next status/readback authority to bind to the moved resulting head",
  };
}
