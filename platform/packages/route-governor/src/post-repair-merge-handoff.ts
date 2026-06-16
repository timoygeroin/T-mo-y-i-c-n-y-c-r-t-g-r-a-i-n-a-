export type PostRepairMergeHandoffIntent =
  | "request_review"
  | "merge"
  | "continue_embodiment"
  | "read_status"
  | "warning_maintenance"
  | "emit_blocker";

export type PostRepairMergeHandoffStatusVerdict =
  | "passing"
  | "passing_with_warnings"
  | "pending"
  | "failing"
  | "no_status_surface";

export type PostRepairMergeHandoffAction =
  | "admit_review_handoff"
  | "admit_merge_handoff"
  | "route_to_external_embodiment"
  | "route_to_live_status_readback"
  | "emit_exact_external_blocker"
  | "block_branch_mismatch"
  | "block_repaired_head_replay"
  | "block_unresolved_repair_boundary"
  | "block_stale_status_surface"
  | "block_incomplete_status_surface"
  | "block_unready_pr"
  | "block_warning_maintenance"
  | "block_missing_exact_blocker";

export interface PostRepairMergeStatusSurface {
  surface_id: string;
  head_sha: string;
  verdict: PostRepairMergeHandoffStatusVerdict;
  decisive_successes: string[];
  blockers: string[];
  warnings: string[];
}

export interface PostRepairMergeHandoffInput {
  repository_full_name: string;
  pr_number: number;
  active_branch: string;
  candidate_branch: string;
  live_head_sha: string;
  repaired_head_sha: string;
  last_status_readback_head_sha: string;
  resolved_blocker_ids: string[];
  draft: boolean;
  mergeable: boolean;
  requested_intent: PostRepairMergeHandoffIntent;
  status_surface?: PostRepairMergeStatusSurface;
  required_approval_count: number;
  approval_count: number;
  exact_blocker?: string;
}

export interface PostRepairMergeHandoffVerdict {
  ok: boolean;
  action: PostRepairMergeHandoffAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  retired_heads: string[];
  next_route: string;
}

function base(input: PostRepairMergeHandoffInput): Pick<
  PostRepairMergeHandoffVerdict,
  "repository_full_name" | "pr_number" | "branch" | "head_sha" | "warnings" | "retired_heads"
> {
  const retired = new Set<string>();
  if (input.repaired_head_sha !== input.live_head_sha) retired.add(input.repaired_head_sha);
  if (input.last_status_readback_head_sha !== input.live_head_sha) retired.add(input.last_status_readback_head_sha);

  return {
    repository_full_name: input.repository_full_name,
    pr_number: input.pr_number,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    warnings: input.status_surface?.warnings ?? [],
    retired_heads: [...retired],
  };
}

function block(
  input: PostRepairMergeHandoffInput,
  action: Exclude<
    PostRepairMergeHandoffAction,
    | "admit_review_handoff"
    | "admit_merge_handoff"
    | "route_to_external_embodiment"
    | "route_to_live_status_readback"
    | "emit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): PostRepairMergeHandoffVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function passing(surface: PostRepairMergeStatusSurface): boolean {
  return (
    (surface.verdict === "passing" || surface.verdict === "passing_with_warnings") &&
    surface.decisive_successes.length > 0 &&
    surface.blockers.length === 0
  );
}

export function compilePostRepairMergeHandoff(
  input: PostRepairMergeHandoffInput,
): PostRepairMergeHandoffVerdict {
  if (input.candidate_branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`candidate branch ${input.candidate_branch} does not match active branch ${input.active_branch}`],
      "bind post-repair merge handoff to the active PR branch before release",
    );
  }

  if (input.live_head_sha === input.repaired_head_sha) {
    return block(
      input,
      "block_repaired_head_replay",
      [`live head ${input.live_head_sha} is still the repaired historical head`],
      "advance to the real live PR head before post-repair merge handoff",
      [`repaired head ${input.repaired_head_sha}`],
    );
  }

  if (input.resolved_blocker_ids.length === 0) {
    return block(
      input,
      "block_unresolved_repair_boundary",
      ["post-repair merge handoff requires at least one resolved blocker receipt"],
      "record the resolved repair boundary before review or merge handoff",
    );
  }

  if (input.requested_intent === "emit_blocker") {
    const blocker = input.exact_blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_missing_exact_blocker",
        ["post-repair merge handoff blocker intent has no blocker text"],
        "name one exact external blocker or choose review, merge, status, or embodiment routing",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_exact_external_blocker",
      decisive_evidence: [blocker, `live head ${input.live_head_sha}`],
      blockers: [blocker],
      next_route: "remove the named external blocker before attempting post-repair handoff again",
    };
  }

  const surface = input.status_surface;
  if (!surface) {
    return {
      ...base(input),
      ok: false,
      action: "route_to_live_status_readback",
      decisive_evidence: [`live head ${input.live_head_sha}`],
      blockers: [`no live-head status surface is attached for ${input.live_head_sha}`],
      next_route: "read the live-head status surface before review or merge handoff",
    };
  }

  if (surface.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_status_surface",
      [`status surface ${surface.surface_id} belongs to ${surface.head_sha}, not ${input.live_head_sha}`],
      "discard stale status and read status for the live PR head",
      [surface.surface_id],
    );
  }

  if (!passing(surface)) {
    return block(
      input,
      "block_incomplete_status_surface",
      [
        ...surface.blockers,
        ...(surface.decisive_successes.length === 0 ? ["live status surface has no decisive success evidence"] : []),
        ...(surface.verdict === "pending" ? ["live status surface is pending"] : []),
        ...(surface.verdict === "failing" ? ["live status surface is failing"] : []),
        ...(surface.verdict === "no_status_surface" ? ["live status surface is missing"] : []),
      ],
      "wait for or repair the live-head status surface before post-repair handoff",
      [surface.surface_id],
    );
  }

  if (input.requested_intent === "warning_maintenance") {
    return block(
      input,
      "block_warning_maintenance",
      ["warning-only maintenance cannot replace post-repair review or merge handoff"],
      "treat warning-only status as non-blocking and choose review, merge, embodiment, or exact blocker",
      [surface.surface_id, ...surface.warnings],
    );
  }

  if (input.draft || !input.mergeable) {
    return block(
      input,
      "block_unready_pr",
      [
        ...(input.draft ? ["PR is still draft"] : []),
        ...(!input.mergeable ? ["GitHub mergeability is not confirmed"] : []),
      ],
      "make the PR non-draft and mergeable before post-repair review or merge handoff",
      [surface.surface_id],
    );
  }

  const evidence = [
    `live head ${input.live_head_sha}`,
    `status surface ${surface.surface_id}`,
    ...surface.decisive_successes,
    ...input.resolved_blocker_ids.map((id) => `resolved blocker ${id}`),
  ];

  if (input.requested_intent === "request_review") {
    return {
      ...base(input),
      ok: true,
      action: "admit_review_handoff",
      decisive_evidence: evidence,
      blockers: [],
      next_route: "request final review on the live PR head; do not add another status summary or warning-only maintenance step",
    };
  }

  if (input.requested_intent === "merge") {
    if (input.approval_count < Math.max(1, input.required_approval_count)) {
      return block(
        input,
        "block_unready_pr",
        [`merge handoff requires ${Math.max(1, input.required_approval_count)} approval(s); got ${input.approval_count}`],
        "request or wait for live-head approval before compiling merge command",
        evidence,
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_merge_handoff",
      decisive_evidence: [...evidence, `approvals ${input.approval_count}`],
      blockers: [],
      next_route: "compile the guarded GitHub merge command only while the PR head still matches this handoff",
    };
  }

  if (input.requested_intent === "continue_embodiment") {
    return {
      ...base(input),
      ok: true,
      action: "route_to_external_embodiment",
      decisive_evidence: evidence,
      blockers: [],
      next_route: "continue with a non-repeated executable embodiment only if review or merge handoff is intentionally deferred",
    };
  }

  return block(
    input,
    "block_warning_maintenance",
    [`post-repair handoff intent ${input.requested_intent} is weaker than the passing live-head surface`],
    "use the passing live-head surface for review or merge handoff, unless a new exact blocker appears",
    evidence,
  );
}
