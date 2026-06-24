import type { ReviewResponseIntakeVerdict } from "./review-response-intake.js";
import type { MergeFinalizationStatusSurface } from "./merge-finalization-command.js";

export type ReviewToMergeContinuationAction =
  | "compile_merge_finalization_command"
  | "wait_for_review_response"
  | "route_to_review_repair"
  | "read_current_head_status"
  | "wait_for_checks"
  | "repair_status_failure"
  | "block_stale_review_intake"
  | "block_branch_mismatch"
  | "block_unready_pr"
  | "block_missing_review_approval"
  | "block_missing_finalization_surface"
  | "block_mergeability_unknown";

export interface ReviewToMergeContinuationInput {
  review_intake: ReviewResponseIntakeVerdict;
  active_branch: string;
  live_head_sha: string;
  draft: boolean;
  mergeable: boolean | null | "unknown";
  status_surface?: MergeFinalizationStatusSurface;
  required_approval_count: number;
  promoted_surface_ids: string[];
}

export interface ReviewToMergeCommandSeed {
  operation: "compile_merge_finalization_command";
  repository_full_name: string;
  pr_number: number;
  branch: string;
  live_head_sha: string;
  approval_count: number;
  required_approval_count: number;
  required_status_surface_id: string;
}

export interface ReviewToMergeContinuationVerdict {
  ok: boolean;
  action: ReviewToMergeContinuationAction;
  command_seed: ReviewToMergeCommandSeed | null;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

const REQUIRED_FINALIZATION_SURFACES = [
  "merge-finalization-command-public-surface",
  "merge-result-receipt-public-surface",
];

function statusPassing(surface: MergeFinalizationStatusSurface): boolean {
  return (
    (surface.verdict === "passing" || surface.verdict === "passing_with_warnings") &&
    surface.head_sha.length > 0 &&
    surface.decisive_successes.length > 0 &&
    surface.blocking_failures.length === 0 &&
    surface.pending_surfaces.length === 0
  );
}

function statusBlockers(surface: MergeFinalizationStatusSurface): string[] {
  if (surface.blocking_failures.length > 0) return surface.blocking_failures;
  if (surface.pending_surfaces.length > 0) return surface.pending_surfaces;
  if (surface.decisive_successes.length === 0) return ["current-head status surface has no decisive success evidence"];
  return [`status verdict ${surface.verdict}`];
}

function block(
  action: Exclude<ReviewToMergeContinuationAction, "compile_merge_finalization_command">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
  warnings: string[] = [],
): ReviewToMergeContinuationVerdict {
  return {
    ok: false,
    action,
    command_seed: null,
    decisive_evidence: evidence,
    blockers,
    warnings,
    next_route: nextRoute,
  };
}

export function routeReviewToMergeContinuation(
  input: ReviewToMergeContinuationInput,
): ReviewToMergeContinuationVerdict {
  const intake = input.review_intake;
  const evidence = [
    `review intake action ${intake.action}`,
    `review intake head ${intake.head_sha}`,
    `live head ${input.live_head_sha}`,
    `branch ${intake.branch}`,
  ];

  if (intake.branch !== input.active_branch) {
    return block(
      "block_branch_mismatch",
      [`review intake branch ${intake.branch} does not match active branch ${input.active_branch}`],
      "rebuild review intake from the active PR branch before merge continuation",
      evidence,
    );
  }

  if (intake.head_sha !== input.live_head_sha) {
    return block(
      "block_stale_review_intake",
      [`review intake head ${intake.head_sha} is not live head ${input.live_head_sha}`],
      "discard stale review intake and reread review responses for the live PR head",
      evidence,
    );
  }

  if (intake.action === "route_to_review_repair") {
    return block(
      "route_to_review_repair",
      intake.blockers.length > 0 ? intake.blockers : ["review changes were requested on the live head"],
      "repair the live-head review feedback before compiling merge finalization",
      [...evidence, ...intake.decisive_evidence],
    );
  }

  if (intake.action === "wait_for_review_response") {
    return block(
      "wait_for_review_response",
      intake.blockers.length > 0 ? intake.blockers : ["required live-head review response has not surfaced"],
      "wait for live-head review approval or emit the exact external review blocker",
      [...evidence, ...intake.decisive_evidence],
    );
  }

  if (!intake.ok || intake.action !== "route_to_merge_gate") {
    return block(
      "wait_for_review_response",
      intake.blockers.length > 0 ? intake.blockers : [`review intake action ${intake.action} does not admit merge gate`],
      "obtain live-head review approval before merge continuation",
      [...evidence, ...intake.decisive_evidence],
    );
  }

  if (input.draft) {
    return block(
      "block_unready_pr",
      ["PR is still draft"],
      "mark the PR ready for review before merge continuation",
      evidence,
    );
  }

  const requiredApprovals = Math.max(1, input.required_approval_count);
  if (intake.approvals.length < requiredApprovals) {
    return block(
      "block_missing_review_approval",
      [`merge continuation requires ${requiredApprovals} approval(s); got ${intake.approvals.length}`],
      "wait for the required live-head review approval before merge continuation",
      [...evidence, ...intake.decisive_evidence],
    );
  }

  if (!input.status_surface) {
    return block(
      "read_current_head_status",
      [],
      "read the current live-head status surface before compiling merge finalization",
      [...evidence, "missing current-head status surface"],
    );
  }

  const warnings = input.status_surface.non_blocking_warnings;
  if (input.status_surface.head_sha !== input.live_head_sha) {
    return block(
      "block_stale_review_intake",
      [`status surface ${input.status_surface.surface_id} belongs to ${input.status_surface.head_sha}`],
      "refresh status against the live PR head before merge continuation",
      [...evidence, input.status_surface.surface_id],
      warnings,
    );
  }

  if (!statusPassing(input.status_surface)) {
    const blockers = statusBlockers(input.status_surface);
    return block(
      input.status_surface.pending_surfaces.length > 0 ? "wait_for_checks" : "repair_status_failure",
      blockers,
      input.status_surface.pending_surfaces.length > 0
        ? "wait for live-head checks to finish before merge continuation"
        : "repair the live-head status failure before merge continuation",
      [...evidence, input.status_surface.surface_id],
      warnings,
    );
  }

  if (input.mergeable !== true) {
    return block(
      "block_mergeability_unknown",
      [`GitHub mergeability is not confirmed for live head ${input.live_head_sha}`],
      "refresh PR metadata after GitHub computes mergeability or resolve the merge conflict",
      [...evidence, input.status_surface.surface_id],
      warnings,
    );
  }

  const missingSurfaces = REQUIRED_FINALIZATION_SURFACES.filter((surface) => !input.promoted_surface_ids.includes(surface));
  if (missingSurfaces.length > 0) {
    return block(
      "block_missing_finalization_surface",
      missingSurfaces.map((surface) => `missing promoted finalization surface ${surface}`),
      "promote merge command and merge receipt surfaces before compiling merge finalization",
      [...evidence, input.status_surface.surface_id],
      warnings,
    );
  }

  return {
    ok: true,
    action: "compile_merge_finalization_command",
    command_seed: {
      operation: "compile_merge_finalization_command",
      repository_full_name: intake.repository_full_name,
      pr_number: intake.pr_number,
      branch: intake.branch,
      live_head_sha: input.live_head_sha,
      approval_count: intake.approvals.length,
      required_approval_count: requiredApprovals,
      required_status_surface_id: input.status_surface.surface_id,
    },
    decisive_evidence: [
      ...evidence,
      ...intake.decisive_evidence,
      input.status_surface.surface_id,
      ...input.status_surface.decisive_successes,
      `approvals ${intake.approvals.length}`,
      ...REQUIRED_FINALIZATION_SURFACES.map((surface) => `promoted surface ${surface}`),
    ],
    blockers: [],
    warnings,
    next_route: "compile the live-head merge finalization command; do not route approval directly to merge without this gate",
  };
}
