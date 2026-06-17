export type ReviewReadyStatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "no_status_surface";

export type ReviewReadyMoveClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "duplicate_review_request"
  | "duplicate_status_summary"
  | "duplicate_label"
  | "metadata_reread"
  | "reclose_resolved_blocker";

export type ReviewReadyHandoffAction =
  | "admit_review_ready_embodiment"
  | "admit_moved_head_status_readback"
  | "emit_exact_external_blocker"
  | "block_draft_pr"
  | "block_branch_mismatch"
  | "block_stale_base_head"
  | "block_non_progress_class"
  | "block_unretired_resolved_boundary"
  | "block_live_status_not_ready"
  | "block_incomplete_embodiment"
  | "block_missing_exact_blocker";

export interface ReviewReadyEmbodimentCandidate {
  candidate_id: string;
  move_class: ReviewReadyMoveClass;
  branch: string;
  base_head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  blocker?: string;
}

export interface ReviewReadyEmbodimentHandoffInput {
  active_branch: string;
  live_head_sha: string;
  last_repaired_head_sha: string;
  last_status_readback_head_sha: string;
  pr_is_draft: boolean;
  resolved_boundary_ids: string[];
  live_status_verdict: ReviewReadyStatusVerdict;
  candidate: ReviewReadyEmbodimentCandidate;
}

export interface ReviewReadyEmbodimentHandoffVerdict {
  ok: boolean;
  action: ReviewReadyHandoffAction;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  retired_boundaries: string[];
  next_route: string;
}

const NON_PROGRESS_CLASSES = new Set<ReviewReadyMoveClass>([
  "duplicate_review_request",
  "duplicate_status_summary",
  "duplicate_label",
  "metadata_reread",
  "reclose_resolved_blocker",
]);

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function proofOnlyPath(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function readyStatus(verdict: ReviewReadyStatusVerdict): boolean {
  return verdict === "passing" || verdict === "passing_with_warnings";
}

function retiredBoundaries(input: ReviewReadyEmbodimentHandoffInput): string[] {
  const retired = new Set<string>(input.resolved_boundary_ids);
  if (input.last_repaired_head_sha !== input.live_head_sha) retired.add(`repaired-head:${input.last_repaired_head_sha}`);
  if (input.last_status_readback_head_sha !== input.live_head_sha) {
    retired.add(`status-readback-head:${input.last_status_readback_head_sha}`);
  }
  return [...retired];
}

function base(input: ReviewReadyEmbodimentHandoffInput): Pick<
  ReviewReadyEmbodimentHandoffVerdict,
  "branch" | "head_sha" | "retired_boundaries"
> {
  return {
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    retired_boundaries: retiredBoundaries(input),
  };
}

function block(
  input: ReviewReadyEmbodimentHandoffInput,
  action: Exclude<
    ReviewReadyHandoffAction,
    "admit_review_ready_embodiment" | "admit_moved_head_status_readback" | "emit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ReviewReadyEmbodimentHandoffVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function embodimentBlockers(candidate: ReviewReadyEmbodimentCandidate): string[] {
  const executableChanges = candidate.changed_files.filter(executablePlatformPath);
  const behaviorChanges = executableChanges.filter((path) => !proofOnlyPath(path));
  const blockers: string[] = [];

  if (!candidate.candidate_id.trim()) blockers.push("review-ready embodiment candidate has no candidate id");
  if (executableChanges.length === 0) blockers.push("review-ready embodiment changes no executable platform file");
  if (executableChanges.length > 0 && behaviorChanges.length === 0) {
    blockers.push("review-ready embodiment is proof-only and has no behavior-bearing file");
  }
  if (candidate.executable_artifacts.length === 0) blockers.push("review-ready embodiment has no executable artifact evidence");
  if (candidate.routing_artifacts.length === 0) blockers.push("review-ready embodiment has no future-routing artifact evidence");
  if (candidate.proof_artifacts.length === 0) blockers.push("review-ready embodiment has no proof artifact evidence");

  return blockers;
}

export function routeReviewReadyEmbodimentHandoff(
  input: ReviewReadyEmbodimentHandoffInput,
): ReviewReadyEmbodimentHandoffVerdict {
  const candidate = input.candidate;

  if (input.pr_is_draft) {
    return block(
      input,
      "block_draft_pr",
      ["PR is still draft; review-ready embodiment handoff is not active"],
      "mark the PR ready or use the pre-review finalization route before review-bound embodiment",
    );
  }

  if (candidate.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`],
      "bind review-ready progress to the active manifestation branch before release",
    );
  }

  if (NON_PROGRESS_CLASSES.has(candidate.move_class)) {
    return block(
      input,
      "block_non_progress_class",
      [`review-ready move class is non-progress: ${candidate.move_class}`],
      "choose executable embodiment, genuinely moved-head status readback, or one exact external blocker",
      [candidate.move_class, ...retiredBoundaries(input)],
    );
  }

  if (candidate.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      candidate.base_head_sha === input.last_repaired_head_sha ? "block_unretired_resolved_boundary" : "block_stale_base_head",
      [`candidate base ${candidate.base_head_sha} is not live head ${input.live_head_sha}`],
      "rebase the candidate to the live PR head; keep repaired-head status only as retired history",
      [`last repaired head ${input.last_repaired_head_sha}`, `last status readback head ${input.last_status_readback_head_sha}`],
    );
  }

  if (candidate.move_class === "fresh_status_readback") {
    const movedSinceReadback = input.live_head_sha !== input.last_status_readback_head_sha;
    if (!movedSinceReadback) {
      return block(
        input,
        "block_unretired_resolved_boundary",
        ["review-ready status readback is not fresh because the live head equals the last readback head"],
        "commit executable embodiment or name an exact blocker before another status readback",
        [`last status readback head ${input.last_status_readback_head_sha}`],
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_moved_head_status_readback",
      decisive_evidence: [`head moved from ${input.last_status_readback_head_sha} to ${input.live_head_sha}`],
      blockers: [],
      next_route: "read only current live-head checks before making a review-ready status claim",
    };
  }

  if (candidate.move_class === "exact_external_blocker") {
    const blocker = candidate.blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_missing_exact_blocker",
        ["review-ready exact blocker candidate has no blocker text"],
        "name one exact external blocker or choose executable embodiment",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_exact_external_blocker",
      decisive_evidence: [blocker, `live head ${input.live_head_sha}`],
      blockers: [blocker],
      next_route: "remove the named blocker before attempting review-ready embodiment again",
    };
  }

  if (!readyStatus(input.live_status_verdict)) {
    return block(
      input,
      "block_live_status_not_ready",
      [`live status is ${input.live_status_verdict}`],
      "obtain passing live-head status or emit the exact live blocker before review-ready embodiment",
    );
  }

  const blockers = embodimentBlockers(candidate);
  if (blockers.length > 0) {
    return block(
      input,
      "block_incomplete_embodiment",
      blockers,
      "supply behavior-bearing executable, routing, and proof evidence before moving the review-ready branch",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_review_ready_embodiment",
    decisive_evidence: [
      "PR is non-draft and ready for review",
      `live head ${input.live_head_sha}`,
      ...retiredBoundaries(input).map((boundary) => `retired boundary: ${boundary}`),
      ...candidate.changed_files.filter(executablePlatformPath),
      ...candidate.executable_artifacts,
      ...candidate.routing_artifacts,
      ...candidate.proof_artifacts,
    ],
    blockers: [],
    next_route: "commit the review-ready embodiment, then bind any status claim to the moved head only",
  };
}
