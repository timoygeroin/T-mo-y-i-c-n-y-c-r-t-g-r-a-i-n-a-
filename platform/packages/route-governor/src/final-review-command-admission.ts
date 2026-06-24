export type FinalReviewCommandAdmissionCommand =
  | "request_final_review"
  | "merge_finalization"
  | "exact_external_blocker";

export type FinalReviewCommandAdmissionAction =
  | "admit_review_request_command"
  | "admit_merge_finalization_command"
  | "emit_exact_external_blocker"
  | "block_reused_command"
  | "block_branch_mismatch"
  | "block_head_mismatch"
  | "block_failed_status"
  | "block_pending_status"
  | "block_failed_mergeability"
  | "block_missing_reviewer"
  | "block_review_pending"
  | "block_review_changes_requested"
  | "block_missing_approval"
  | "block_live_blocker";

export type FinalReviewStatusKind = "passing" | "passing_with_warnings" | "pending" | "failing";
export type FinalReviewMergeabilityKind = "mergeable" | "blocked" | "unknown";
export type FinalReviewStateKind = "none" | "requested" | "approved" | "changes_requested";

export interface FinalReviewCommandSurface {
  surface_id: string;
  branch: string;
  head_sha: string;
  evidence: string[];
}

export interface FinalReviewStatusSurface extends FinalReviewCommandSurface {
  kind: FinalReviewStatusKind;
  blockers: string[];
  warnings?: string[];
}

export interface FinalReviewMergeabilitySurface extends FinalReviewCommandSurface {
  kind: FinalReviewMergeabilityKind;
  blockers: string[];
}

export interface FinalReviewStateSurface extends FinalReviewCommandSurface {
  kind: FinalReviewStateKind;
  reviewer_logins: string[];
  blockers: string[];
}

export interface FinalReviewBlockerSurface extends FinalReviewCommandSurface {
  open_blockers: string[];
}

export interface FinalReviewCommandAdmissionInput {
  active_branch: string;
  live_head_sha: string;
  command_id: string;
  spent_command_ids: string[];
  desired_command: FinalReviewCommandAdmissionCommand;
  status: FinalReviewStatusSurface;
  mergeability: FinalReviewMergeabilitySurface;
  review: FinalReviewStateSurface;
  blocker_surface: FinalReviewBlockerSurface;
  exact_blocker?: string;
}

export interface FinalReviewCommandAdmissionVerdict {
  ok: boolean;
  action: FinalReviewCommandAdmissionAction;
  command_id: string | null;
  command: FinalReviewCommandAdmissionCommand;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

function surfaceEvidence(surface: FinalReviewCommandSurface): string[] {
  return [surface.surface_id, surface.branch, surface.head_sha, ...surface.evidence];
}

function allSurfaces(input: FinalReviewCommandAdmissionInput): FinalReviewCommandSurface[] {
  return [input.status, input.mergeability, input.review, input.blocker_surface];
}

function base(input: FinalReviewCommandAdmissionInput): Pick<
  FinalReviewCommandAdmissionVerdict,
  "command_id" | "command" | "branch" | "head_sha" | "warnings"
> {
  return {
    command_id: input.command_id.trim() || null,
    command: input.desired_command,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    warnings: input.status.warnings ?? [],
  };
}

function block(
  input: FinalReviewCommandAdmissionInput,
  action: Exclude<
    FinalReviewCommandAdmissionAction,
    "admit_review_request_command" | "admit_merge_finalization_command" | "emit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): FinalReviewCommandAdmissionVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

export function admitFinalReviewCommand(
  input: FinalReviewCommandAdmissionInput,
): FinalReviewCommandAdmissionVerdict {
  const commandId = input.command_id.trim();
  const commandEvidence = [`command ${commandId || "<missing>"}`, `desired ${input.desired_command}`];

  if (!commandId || input.spent_command_ids.includes(commandId)) {
    return block(
      input,
      "block_reused_command",
      [commandId ? `final review command already spent: ${commandId}` : "final review command has no id"],
      "create a fresh live-head command id before issuing another final review command",
      commandEvidence,
    );
  }

  const wrongBranch = allSurfaces(input).find((surface) => surface.branch !== input.active_branch);
  if (wrongBranch) {
    return block(
      input,
      "block_branch_mismatch",
      [`surface ${wrongBranch.surface_id} is on ${wrongBranch.branch}, not ${input.active_branch}`],
      "rebuild final review command admission from active-branch surfaces only",
      [...commandEvidence, ...surfaceEvidence(wrongBranch)],
    );
  }

  const wrongHead = allSurfaces(input).find((surface) => surface.head_sha !== input.live_head_sha);
  if (wrongHead) {
    return block(
      input,
      "block_head_mismatch",
      [`surface ${wrongHead.surface_id} belongs to ${wrongHead.head_sha}, not live head ${input.live_head_sha}`],
      "discard stale final review surfaces and re-open admission on the live PR head",
      [...commandEvidence, ...surfaceEvidence(wrongHead)],
    );
  }

  if (input.desired_command === "exact_external_blocker") {
    const blocker = input.exact_blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_live_blocker",
        ["exact external blocker command has no blocker text"],
        "name the exact external blocker before releasing blocker authority",
        commandEvidence,
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_exact_external_blocker",
      decisive_evidence: [...commandEvidence, blocker],
      blockers: [blocker],
      next_route: "remove the named blocker before issuing final review or merge commands",
    };
  }

  if (input.status.kind === "failing" || input.status.blockers.length > 0) {
    return block(
      input,
      "block_failed_status",
      input.status.blockers.length > 0 ? input.status.blockers : ["live-head status is failing"],
      "repair the live-head status failure before final review command admission",
      [...commandEvidence, ...surfaceEvidence(input.status)],
    );
  }

  if (input.status.kind === "pending") {
    return block(
      input,
      "block_pending_status",
      ["live-head status is still pending"],
      "wait for live-head status completion before final review command admission",
      [...commandEvidence, ...surfaceEvidence(input.status)],
    );
  }

  if (input.mergeability.kind !== "mergeable" || input.mergeability.blockers.length > 0) {
    return block(
      input,
      "block_failed_mergeability",
      input.mergeability.blockers.length > 0
        ? input.mergeability.blockers
        : [`mergeability is ${input.mergeability.kind}`],
      "resolve live-head mergeability before issuing final review or merge commands",
      [...commandEvidence, ...surfaceEvidence(input.mergeability)],
    );
  }

  if (input.blocker_surface.open_blockers.length > 0) {
    return block(
      input,
      "block_live_blocker",
      input.blocker_surface.open_blockers,
      "retire open live blockers before issuing final review or merge commands",
      [...commandEvidence, ...surfaceEvidence(input.blocker_surface)],
    );
  }

  if (input.desired_command === "request_final_review") {
    if (input.review.kind === "requested") {
      return block(
        input,
        "block_review_pending",
        ["final review is already requested for this live head"],
        "wait for live-head review feedback before requesting review again",
        [...commandEvidence, ...surfaceEvidence(input.review)],
      );
    }

    if (input.review.kind === "changes_requested") {
      return block(
        input,
        "block_review_changes_requested",
        input.review.blockers.length > 0 ? input.review.blockers : ["review changes are requested"],
        "route requested changes into bounded repair before requesting final review again",
        [...commandEvidence, ...surfaceEvidence(input.review)],
      );
    }

    if (input.review.reviewer_logins.length === 0) {
      return block(
        input,
        "block_missing_reviewer",
        ["final review request has no reviewer login"],
        "attach at least one reviewer before issuing the final review request command",
        [...commandEvidence, ...surfaceEvidence(input.review)],
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_review_request_command",
      decisive_evidence: [
        ...commandEvidence,
        ...surfaceEvidence(input.status),
        ...surfaceEvidence(input.mergeability),
        ...surfaceEvidence(input.review),
        ...surfaceEvidence(input.blocker_surface),
      ],
      blockers: [],
      next_route: "issue exactly one final review request, then route the downstream result through final-review outcome intake",
    };
  }

  if (input.review.kind !== "approved") {
    return block(
      input,
      "block_missing_approval",
      [`merge finalization requires approved review, got ${input.review.kind}`],
      "obtain live-head review approval before issuing merge finalization",
      [...commandEvidence, ...surfaceEvidence(input.review)],
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_merge_finalization_command",
    decisive_evidence: [
      ...commandEvidence,
      ...surfaceEvidence(input.status),
      ...surfaceEvidence(input.mergeability),
      ...surfaceEvidence(input.review),
      ...surfaceEvidence(input.blocker_surface),
    ],
    blockers: [],
    next_route: "issue exactly one merge finalization command and seal only the concrete merge result receipt",
  };
}
