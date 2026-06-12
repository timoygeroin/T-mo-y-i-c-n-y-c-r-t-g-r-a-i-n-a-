export type TerminalReviewRequestedAction =
  | "request_review"
  | "merge"
  | "continue_embodiment"
  | "read_status"
  | "emit_blocker";

export type TerminalReviewHandoffAction =
  | "admit_review_request"
  | "admit_merge"
  | "route_to_status_readback"
  | "route_to_external_embodiment"
  | "admit_exact_blocker"
  | "block_stale_status"
  | "block_historical_head"
  | "block_incomplete_readiness"
  | "block_unbound_request";

export interface TerminalReviewStatusSurface {
  surface_id: string;
  head_sha: string;
  verdict: "passing" | "passing_with_warnings" | "pending" | "failing" | "missing";
  decisive_successes: string[];
  blockers: string[];
  warnings: string[];
}

export interface TerminalReviewHandoffInput {
  repository_full_name: string;
  pr_number: number;
  active_branch: string;
  candidate_branch: string;
  live_head_sha: string;
  last_embodiment_head_sha: string;
  historical_repaired_heads: string[];
  merge_ready: boolean;
  mergeable: boolean;
  draft: boolean;
  requested_action: TerminalReviewRequestedAction;
  status_surface?: TerminalReviewStatusSurface;
  exact_blocker?: string;
}

export interface TerminalReviewHandoffVerdict {
  ok: boolean;
  action: TerminalReviewHandoffAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  quarantined_heads: string[];
  warnings: string[];
  next_route: string;
}

function base(input: TerminalReviewHandoffInput): Pick<
  TerminalReviewHandoffVerdict,
  "repository_full_name" | "pr_number" | "branch" | "head_sha" | "quarantined_heads" | "warnings"
> {
  return {
    repository_full_name: input.repository_full_name,
    pr_number: input.pr_number,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    quarantined_heads: input.historical_repaired_heads.filter((head) => head !== input.live_head_sha),
    warnings: input.status_surface?.warnings ?? [],
  };
}

function block(
  input: TerminalReviewHandoffInput,
  action: Exclude<TerminalReviewHandoffAction, "admit_review_request" | "admit_merge" | "admit_exact_blocker">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): TerminalReviewHandoffVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function livePassingStatus(input: TerminalReviewHandoffInput): boolean {
  return (
    Boolean(input.status_surface) &&
    input.status_surface?.head_sha === input.live_head_sha &&
    (input.status_surface.verdict === "passing" || input.status_surface.verdict === "passing_with_warnings") &&
    input.status_surface.decisive_successes.length > 0 &&
    input.status_surface.blockers.length === 0
  );
}

export function compileTerminalReviewHandoff(input: TerminalReviewHandoffInput): TerminalReviewHandoffVerdict {
  if (input.candidate_branch !== input.active_branch) {
    return block(
      input,
      "block_unbound_request",
      [`candidate branch ${input.candidate_branch} does not match active branch ${input.active_branch}`],
      "bind terminal review handoff to the active PR branch before releasing it",
    );
  }

  if (input.historical_repaired_heads.includes(input.live_head_sha)) {
    return block(
      input,
      "block_historical_head",
      [`live head ${input.live_head_sha} is a resolved historical repaired head`],
      "advance to a post-repaired-head embodiment or read the actual current PR head before review handoff",
    );
  }

  if (input.requested_action === "emit_blocker") {
    const blocker = input.exact_blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_incomplete_readiness",
        ["terminal blocker action has no exact blocker text"],
        "emit one exact external blocker or choose review, merge, status, or embodiment routing",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_exact_blocker",
      decisive_evidence: [blocker, `live head ${input.live_head_sha}`],
      blockers: [blocker],
      next_route: "resolve the named external blocker before requesting terminal review handoff again",
    };
  }

  if (input.live_head_sha !== input.last_embodiment_head_sha) {
    return block(
      input,
      "route_to_external_embodiment",
      [`live head ${input.live_head_sha} is not the last admitted embodiment head ${input.last_embodiment_head_sha}`],
      "compile or admit the live embodiment receipt before review handoff",
    );
  }

  if (!input.status_surface) {
    return block(
      input,
      "route_to_status_readback",
      [`no status surface is attached for live head ${input.live_head_sha}`],
      "read live-head status before requesting review or merge",
    );
  }

  if (input.status_surface.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_status",
      [`status surface ${input.status_surface.surface_id} belongs to ${input.status_surface.head_sha}`],
      "discard stale status and read status for the live PR head",
      [input.status_surface.surface_id],
    );
  }

  if (!livePassingStatus(input)) {
    return block(
      input,
      "block_incomplete_readiness",
      [
        ...input.status_surface.blockers,
        ...(input.status_surface.decisive_successes.length === 0 ? ["live status surface has no decisive success evidence"] : []),
        ...(input.status_surface.verdict === "pending" ? ["live status surface is pending"] : []),
        ...(input.status_surface.verdict === "failing" ? ["live status surface is failing"] : []),
        ...(input.status_surface.verdict === "missing" ? ["live status surface is missing"] : []),
      ],
      "wait for or repair the live-head status surface before terminal review handoff",
      [input.status_surface.surface_id],
    );
  }

  if (!input.merge_ready || !input.mergeable || input.draft) {
    return block(
      input,
      "block_incomplete_readiness",
      [
        ...(!input.merge_ready ? ["merge readiness compiler has not admitted this head"] : []),
        ...(!input.mergeable ? ["GitHub mergeability is not confirmed"] : []),
        ...(input.draft ? ["PR is still draft"] : []),
      ],
      "complete merge readiness before requesting review or merge handoff",
      [input.status_surface.surface_id],
    );
  }

  const evidence = [
    `live head ${input.live_head_sha}`,
    `status surface ${input.status_surface.surface_id}`,
    ...input.status_surface.decisive_successes,
  ];

  if (input.requested_action === "merge") {
    return {
      ...base(input),
      ok: true,
      action: "admit_merge",
      decisive_evidence: evidence,
      blockers: [],
      next_route: "merge only through the authorized GitHub boundary; do not add another embodiment unless merge is blocked",
    };
  }

  if (input.requested_action === "request_review") {
    return {
      ...base(input),
      ok: true,
      action: "admit_review_request",
      decisive_evidence: evidence,
      blockers: [],
      next_route: "request final review on the live PR head; do not recycle repaired-head status or add another readiness guard",
    };
  }

  return block(
    input,
    input.requested_action === "read_status" ? "route_to_status_readback" : "route_to_external_embodiment",
    [`terminal review handoff request ${input.requested_action} is weaker than admitted review or merge`],
    "use the already admitted live-head readiness to request review or merge, unless a new blocker appears",
    evidence,
  );
}
