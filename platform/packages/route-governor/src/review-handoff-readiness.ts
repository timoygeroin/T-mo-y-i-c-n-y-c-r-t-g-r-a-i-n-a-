export type ReviewHandoffStatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "no_status_surface";

export type ReviewHandoffAction =
  | "admit_review_handoff"
  | "read_live_head_status"
  | "repair_live_head_failure"
  | "wait_for_live_head_checks"
  | "block_draft_pr"
  | "block_branch_mismatch"
  | "block_stale_status_surface"
  | "block_unretired_blocker"
  | "block_missing_review_evidence";

export interface ReviewHandoffStatusSurface {
  surface_id: string;
  head_sha: string;
  verdict: ReviewHandoffStatusVerdict;
  decisive_successes: string[];
  blocking_failures: string[];
  pending_surfaces: string[];
  non_blocking_warnings: string[];
}

export interface ReviewHandoffBlockerReceipt {
  blocker_id: string;
  head_sha: string;
  state: "open" | "closed";
  resolution?: string;
}

export interface ReviewHandoffEvidence {
  executable_artifacts: string[];
  routing_artifacts: string[];
  review_surface_ids: string[];
}

export interface ReviewHandoffReadinessInput {
  repository_full_name: string;
  pr_number: number;
  active_branch: string;
  branch: string;
  live_head_sha: string;
  draft: boolean;
  mergeable: boolean | null | "unknown";
  status_surface?: ReviewHandoffStatusSurface;
  blocker_receipts: ReviewHandoffBlockerReceipt[];
  evidence: ReviewHandoffEvidence;
}

export interface ReviewHandoffReadinessVerdict {
  ok: boolean;
  action: ReviewHandoffAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

function base(input: ReviewHandoffReadinessInput): Pick<
  ReviewHandoffReadinessVerdict,
  "repository_full_name" | "pr_number" | "branch" | "head_sha" | "warnings"
> {
  return {
    repository_full_name: input.repository_full_name,
    pr_number: input.pr_number,
    branch: input.branch,
    head_sha: input.live_head_sha,
    warnings: input.status_surface?.non_blocking_warnings ?? [],
  };
}

function block(
  input: ReviewHandoffReadinessInput,
  action: Exclude<ReviewHandoffAction, "admit_review_handoff">,
  blockers: string[],
  nextRoute: string,
  decisiveEvidence: string[] = [],
): ReviewHandoffReadinessVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: decisiveEvidence,
    blockers,
    next_route: nextRoute,
  };
}

function unresolvedBlockers(input: ReviewHandoffReadinessInput): ReviewHandoffBlockerReceipt[] {
  return input.blocker_receipts.filter((receipt) => receipt.state !== "closed" || receipt.head_sha === input.live_head_sha);
}

function missingEvidence(input: ReviewHandoffReadinessInput): string[] {
  const missing: string[] = [];

  if (input.evidence.executable_artifacts.length === 0) {
    missing.push("review handoff requires executable platform artifact evidence");
  }
  if (input.evidence.routing_artifacts.length === 0) {
    missing.push("review handoff requires future-routing artifact evidence");
  }
  if (input.evidence.review_surface_ids.length === 0) {
    missing.push("review handoff requires a named PR review surface");
  }

  return missing;
}

function statusFailures(surface: ReviewHandoffStatusSurface): string[] {
  if (surface.blocking_failures.length > 0) return surface.blocking_failures;
  if (surface.pending_surfaces.length > 0) return surface.pending_surfaces;
  if (surface.decisive_successes.length === 0) return [`status surface ${surface.surface_id} has no decisive success evidence`];
  return [];
}

export function compileReviewHandoffReadiness(
  input: ReviewHandoffReadinessInput,
): ReviewHandoffReadinessVerdict {
  if (input.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`review handoff branch ${input.branch} does not match active branch ${input.active_branch}`],
      "bind review handoff only to the active manifestation branch",
    );
  }

  if (input.draft) {
    return block(
      input,
      "block_draft_pr",
      ["PR is draft and cannot be handed to review as ready"],
      "make the PR ready for review before compiling review handoff readiness",
    );
  }

  const surface = input.status_surface;
  if (!surface) {
    return {
      ...base(input),
      ok: true,
      action: "read_live_head_status",
      decisive_evidence: [`no status surface attached for live head ${input.live_head_sha}`],
      blockers: [],
      next_route: "read the live-head status surface before handing the PR to review",
    };
  }

  if (surface.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_status_surface",
      [`status surface ${surface.surface_id} belongs to ${surface.head_sha}, not live head ${input.live_head_sha}`],
      "discard stale repaired-head status and obtain live-head status evidence",
      [surface.surface_id],
    );
  }

  if (surface.verdict === "pending") {
    return block(
      input,
      "wait_for_live_head_checks",
      statusFailures(surface),
      "wait for live-head checks before review handoff",
      [surface.surface_id],
    );
  }

  if (surface.verdict === "failing") {
    return block(
      input,
      "repair_live_head_failure",
      statusFailures(surface),
      "repair only the live-head failure before review handoff",
      [surface.surface_id],
    );
  }

  if (surface.verdict === "no_status_surface") {
    return block(
      input,
      "read_live_head_status",
      statusFailures(surface),
      "obtain a Checks, Actions, or status-readback surface for the live head",
      [surface.surface_id],
    );
  }

  const unresolved = unresolvedBlockers(input);
  if (unresolved.length > 0) {
    return block(
      input,
      "block_unretired_blocker",
      unresolved.map((receipt) => `blocker ${receipt.blocker_id} is ${receipt.state} at ${receipt.head_sha}`),
      "retire or supersede all live-head blockers before review handoff",
      unresolved.map((receipt) => receipt.blocker_id),
    );
  }

  const evidenceFailures = missingEvidence(input);
  if (evidenceFailures.length > 0) {
    return block(
      input,
      "block_missing_review_evidence",
      evidenceFailures,
      "attach executable, routing, and review-surface evidence before review handoff",
      [surface.surface_id],
    );
  }

  if (input.mergeable !== true) {
    return block(
      input,
      "block_missing_review_evidence",
      [`GitHub mergeability is not confirmed for live head ${input.live_head_sha}`],
      "wait for GitHub mergeability to resolve or repair the merge blocker",
      [surface.surface_id],
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_review_handoff",
    decisive_evidence: [
      `live head ${input.live_head_sha}`,
      surface.surface_id,
      ...surface.decisive_successes,
      ...input.blocker_receipts.map((receipt) => `${receipt.blocker_id}:${receipt.state}:${receipt.head_sha}`),
      ...input.evidence.executable_artifacts,
      ...input.evidence.routing_artifacts,
      ...input.evidence.review_surface_ids,
    ],
    blockers: [],
    next_route: "request or await human review; do not add another embodiment guard unless a new live-head blocker appears",
  };
}
