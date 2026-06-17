export type LiveHeadTerminalStatusVerdict =
  | "passing"
  | "passing_with_warnings"
  | "pending"
  | "failing"
  | "no_status_surface";

export type LiveHeadTerminalIntent =
  | "request_review"
  | "merge"
  | "continue_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker";

export type LiveHeadTerminalAction =
  | "issue_review_request"
  | "compile_merge_command"
  | "continue_external_embodiment"
  | "read_moved_head_status"
  | "emit_exact_external_blocker"
  | "block_branch_mismatch"
  | "block_stale_command_head"
  | "block_unready_live_status"
  | "block_draft_or_unmergeable_pr"
  | "block_missing_review_targets"
  | "block_repeated_review_target_set"
  | "block_missing_approval"
  | "block_stale_status_readback"
  | "block_missing_exact_blocker";

export interface LiveHeadTerminalStatusSurface {
  surface_id: string;
  head_sha: string;
  verdict: LiveHeadTerminalStatusVerdict;
  decisive_successes: string[];
  blockers: string[];
  warnings: string[];
}

export interface LiveHeadTerminalReleaseInput {
  repository_full_name: string;
  pr_number: number;
  active_branch: string;
  command_branch: string;
  live_head_sha: string;
  command_head_sha: string;
  previous_status_head_sha: string;
  status_surface?: LiveHeadTerminalStatusSurface;
  draft: boolean;
  mergeable: boolean;
  requested_intent: LiveHeadTerminalIntent;
  requested_reviewers: string[];
  requested_team_reviewers: string[];
  spent_review_target_sets: string[];
  required_approval_count: number;
  approval_count: number;
  exact_blocker?: string;
}

export interface LiveHeadTerminalReleaseVerdict {
  ok: boolean;
  action: LiveHeadTerminalAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  review_target_set_id: string | null;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

function normalize(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function reviewTargetSetId(branch: string, headSha: string, reviewers: string[], teams: string[]): string | null {
  if (reviewers.length === 0 && teams.length === 0) return null;
  const userKey = reviewers.map((reviewer) => `user:${reviewer.toLowerCase()}`).join(",");
  const teamKey = teams.map((team) => `team:${team.toLowerCase()}`).join(",");
  return `${branch}@${headSha}|${userKey}|${teamKey}`;
}

function passing(surface: LiveHeadTerminalStatusSurface): boolean {
  return (
    (surface.verdict === "passing" || surface.verdict === "passing_with_warnings") &&
    surface.blockers.length === 0 &&
    surface.decisive_successes.length > 0
  );
}

function base(
  input: LiveHeadTerminalReleaseInput,
  targetSetId: string | null,
): Pick<
  LiveHeadTerminalReleaseVerdict,
  "repository_full_name" | "pr_number" | "branch" | "head_sha" | "review_target_set_id" | "warnings"
> {
  return {
    repository_full_name: input.repository_full_name,
    pr_number: input.pr_number,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    review_target_set_id: targetSetId,
    warnings: input.status_surface?.warnings ?? [],
  };
}

function block(
  input: LiveHeadTerminalReleaseInput,
  action: Exclude<
    LiveHeadTerminalAction,
    | "issue_review_request"
    | "compile_merge_command"
    | "continue_external_embodiment"
    | "read_moved_head_status"
    | "emit_exact_external_blocker"
  >,
  targetSetId: string | null,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): LiveHeadTerminalReleaseVerdict {
  return {
    ...base(input, targetSetId),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

export function compileLiveHeadTerminalRelease(
  input: LiveHeadTerminalReleaseInput,
): LiveHeadTerminalReleaseVerdict {
  const reviewers = normalize(input.requested_reviewers);
  const teams = normalize(input.requested_team_reviewers);
  const targetSetId = reviewTargetSetId(input.active_branch, input.live_head_sha, reviewers, teams);
  const evidence = [
    `live head ${input.live_head_sha}`,
    `command head ${input.command_head_sha}`,
    `intent ${input.requested_intent}`,
  ];

  if (input.command_branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      targetSetId,
      [`command branch ${input.command_branch} does not match active branch ${input.active_branch}`],
      "bind terminal release commands to the active PR branch",
      evidence,
    );
  }

  if (input.command_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_command_head",
      targetSetId,
      [`command head ${input.command_head_sha} is not live head ${input.live_head_sha}`],
      "refresh the terminal release command against the live PR head",
      evidence,
    );
  }

  if (input.requested_intent === "fresh_status_readback") {
    if (input.previous_status_head_sha === input.live_head_sha) {
      return block(
        input,
        "block_stale_status_readback",
        targetSetId,
        ["fresh status readback cannot repeat the already read live head"],
        "move the PR head, surface new checks, or choose review, merge, embodiment, or exact blocker",
        evidence,
      );
    }

    return {
      ...base(input, targetSetId),
      ok: true,
      action: "read_moved_head_status",
      decisive_evidence: [...evidence, `head moved from ${input.previous_status_head_sha} to ${input.live_head_sha}`],
      blockers: [],
      next_route: "read status only for the moved live head, then return to terminal release selection",
    };
  }

  if (input.requested_intent === "exact_external_blocker") {
    const blocker = input.exact_blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_missing_exact_blocker",
        targetSetId,
        ["terminal release exact-blocker intent has no blocker text"],
        "name the exact external blocker or choose a terminal release action",
        evidence,
      );
    }

    return {
      ...base(input, targetSetId),
      ok: true,
      action: "emit_exact_external_blocker",
      decisive_evidence: [...evidence, blocker],
      blockers: [blocker],
      next_route: "remove the named external blocker before attempting terminal release again",
    };
  }

  const status = input.status_surface;
  if (!status || status.head_sha !== input.live_head_sha || !passing(status)) {
    return block(
      input,
      "block_unready_live_status",
      targetSetId,
      [
        ...(!status ? ["no live-head status surface is attached"] : []),
        ...(status && status.head_sha !== input.live_head_sha
          ? [`status surface ${status.surface_id} belongs to ${status.head_sha}, not ${input.live_head_sha}`]
          : []),
        ...(status && status.head_sha === input.live_head_sha && !passing(status)
          ? [
              ...status.blockers,
              ...(status.decisive_successes.length === 0 ? ["live-head status has no decisive success evidence"] : []),
              ...(status.verdict === "pending" ? ["live-head status is pending"] : []),
              ...(status.verdict === "failing" ? ["live-head status is failing"] : []),
              ...(status.verdict === "no_status_surface" ? ["live-head status surface is missing"] : []),
            ]
          : []),
      ],
      "obtain passing live-head status before review, merge, or embodiment terminal release",
      status ? [...evidence, status.surface_id] : evidence,
    );
  }

  if (input.draft || !input.mergeable) {
    return block(
      input,
      "block_draft_or_unmergeable_pr",
      targetSetId,
      [
        ...(input.draft ? ["PR is draft"] : []),
        ...(!input.mergeable ? ["PR is not mergeable"] : []),
      ],
      "make the live PR non-draft and mergeable before terminal release",
      [...evidence, status.surface_id],
    );
  }

  const statusEvidence = [...evidence, status.surface_id, ...status.decisive_successes];

  if (input.requested_intent === "request_review") {
    if (!targetSetId) {
      return block(
        input,
        "block_missing_review_targets",
        targetSetId,
        ["terminal review request has no external reviewer or team targets"],
        "supply real GitHub reviewer targets or emit the exact reviewer-target blocker",
        statusEvidence,
      );
    }

    if (input.spent_review_target_sets.includes(targetSetId)) {
      return block(
        input,
        "block_repeated_review_target_set",
        targetSetId,
        [`review target set already spent: ${targetSetId}`],
        "do not reissue the same terminal review request for the same live head",
        statusEvidence,
      );
    }

    return {
      ...base(input, targetSetId),
      ok: true,
      action: "issue_review_request",
      decisive_evidence: [
        ...statusEvidence,
        targetSetId,
        ...reviewers.map((reviewer) => `reviewer:${reviewer}`),
        ...teams.map((team) => `team:${team}`),
      ],
      blockers: [],
      next_route: "issue the GitHub review request, then wait for live-head review response before merge",
    };
  }

  if (input.requested_intent === "merge") {
    const required = Math.max(1, input.required_approval_count);
    if (input.approval_count < required) {
      return block(
        input,
        "block_missing_approval",
        targetSetId,
        [`merge requires ${required} live-head approval(s); got ${input.approval_count}`],
        "request or wait for live-head approval before compiling the guarded merge command",
        statusEvidence,
      );
    }

    return {
      ...base(input, targetSetId),
      ok: true,
      action: "compile_merge_command",
      decisive_evidence: [...statusEvidence, `approvals ${input.approval_count}`],
      blockers: [],
      next_route: "compile the guarded GitHub merge command only while the live head still matches this verdict",
    };
  }

  return {
    ...base(input, targetSetId),
    ok: true,
    action: "continue_external_embodiment",
    decisive_evidence: statusEvidence,
    blockers: [],
    next_route: "continue executable embodiment only when review or merge release is intentionally deferred",
  };
}
