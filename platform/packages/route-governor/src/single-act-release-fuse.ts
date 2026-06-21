export type SingleActProgressClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "review_request"
  | "merge_command"
  | "metadata_reread"
  | "duplicate_comment"
  | "duplicate_status_summary"
  | "duplicate_label"
  | "local_memory_guard"
  | "warning_maintenance"
  | "reclose_completed_blocker";

export type SingleActReleaseFuseAction =
  | "admit_single_external_progress_act"
  | "emit_single_exact_external_blocker"
  | "block_reused_release"
  | "block_missing_progress_claim"
  | "block_multiple_progress_claims"
  | "block_branch_mismatch"
  | "block_head_mismatch"
  | "block_non_progress_claim"
  | "block_incomplete_embodiment_claim"
  | "block_incomplete_status_claim"
  | "block_incomplete_blocker_claim";

export interface SingleActProgressClaim {
  claim_id: string;
  progress_class: SingleActProgressClass;
  branch: string;
  head_sha: string;
  evidence: string[];
  changed_files?: string[];
  behavior_artifacts?: string[];
  routing_artifacts?: string[];
  status_surface_ids?: string[];
  exact_blocker?: string;
}

export interface SingleActReleaseFuseInput {
  active_branch: string;
  live_head_sha: string;
  release_id: string;
  spent_release_ids: string[];
  claims: SingleActProgressClaim[];
}

export interface SingleActReleaseFuseVerdict {
  ok: boolean;
  action: SingleActReleaseFuseAction;
  release_id: string | null;
  branch: string;
  head_sha: string;
  admitted_claim_id: string | null;
  admitted_progress_class: SingleActProgressClass | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_CLASSES = new Set<SingleActProgressClass>([
  "metadata_reread",
  "duplicate_comment",
  "duplicate_status_summary",
  "duplicate_label",
  "local_memory_guard",
  "warning_maintenance",
  "reclose_completed_blocker",
]);

function behaviorPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(?:ts|js|mjs)$/.test(path) && !/(?:\.test|-proof)\.ts$/.test(path);
}

function base(input: SingleActReleaseFuseInput): Pick<
  SingleActReleaseFuseVerdict,
  "release_id" | "branch" | "head_sha"
> {
  return {
    release_id: input.release_id.trim() || null,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
  };
}

function block(
  input: SingleActReleaseFuseInput,
  action: Exclude<
    SingleActReleaseFuseAction,
    "admit_single_external_progress_act" | "emit_single_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): SingleActReleaseFuseVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    admitted_claim_id: null,
    admitted_progress_class: null,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function claimEvidence(claim: SingleActProgressClaim): string[] {
  return [
    claim.claim_id,
    claim.progress_class,
    `${claim.branch}:${claim.head_sha}`,
    ...claim.evidence,
    ...(claim.changed_files ?? []),
    ...(claim.behavior_artifacts ?? []),
    ...(claim.routing_artifacts ?? []),
    ...(claim.status_surface_ids ?? []),
    ...(claim.exact_blocker ? [claim.exact_blocker] : []),
  ];
}

function embodimentBlockers(claim: SingleActProgressClaim): string[] {
  const blockers: string[] = [];
  if (!(claim.changed_files ?? []).some(behaviorPath)) blockers.push("embodiment claim changes no behavior-bearing platform file");
  if ((claim.behavior_artifacts ?? []).length === 0) blockers.push("embodiment claim names no behavior artifact");
  if ((claim.routing_artifacts ?? []).length === 0) blockers.push("embodiment claim names no future-routing artifact");
  return blockers;
}

export function fuseSingleActRelease(input: SingleActReleaseFuseInput): SingleActReleaseFuseVerdict {
  const releaseId = input.release_id.trim();
  const releaseEvidence = [`release ${releaseId || "<missing>"}`, `live head ${input.live_head_sha}`];

  if (!releaseId || input.spent_release_ids.includes(releaseId)) {
    return block(
      input,
      "block_reused_release",
      [releaseId ? `single-act release already spent: ${releaseId}` : "single-act release has no id"],
      "issue a fresh release id before finalization output can consume progress authority",
      releaseEvidence,
    );
  }

  if (input.claims.length === 0) {
    return block(
      input,
      "block_missing_progress_claim",
      ["single-act release has no progress claim"],
      "attach exactly one external progress claim or one exact external blocker claim",
      releaseEvidence,
    );
  }

  const wrongBranch = input.claims.find((claim) => claim.branch !== input.active_branch);
  if (wrongBranch) {
    return block(
      input,
      "block_branch_mismatch",
      [`claim ${wrongBranch.claim_id} is on ${wrongBranch.branch}, not ${input.active_branch}`],
      "discard cross-branch claims before finalization release",
      [...releaseEvidence, ...claimEvidence(wrongBranch)],
    );
  }

  const wrongHead = input.claims.find((claim) => claim.head_sha !== input.live_head_sha);
  if (wrongHead) {
    return block(
      input,
      "block_head_mismatch",
      [`claim ${wrongHead.claim_id} belongs to ${wrongHead.head_sha}, not live head ${input.live_head_sha}`],
      "bind the finalization release to the live PR head only",
      [...releaseEvidence, ...claimEvidence(wrongHead)],
    );
  }

  const nonProgress = input.claims.find((claim) => NON_PROGRESS_CLASSES.has(claim.progress_class));
  if (nonProgress) {
    return block(
      input,
      "block_non_progress_claim",
      [`${nonProgress.progress_class} cannot be fused into a progress release`],
      "remove non-progress claims instead of bundling them with a real act",
      [...releaseEvidence, ...claimEvidence(nonProgress)],
    );
  }

  if (input.claims.length !== 1) {
    return block(
      input,
      "block_multiple_progress_claims",
      [`single-act release received ${input.claims.length} progress claims`],
      "choose exactly one external act, one fresh status readback, or one exact blocker for this release",
      [...releaseEvidence, ...input.claims.flatMap(claimEvidence)],
    );
  }

  const [claim] = input.claims;
  if (!claim) throw new Error("unreachable: claims length checked above");

  if (claim.progress_class === "external_platform_embodiment") {
    const blockers = embodimentBlockers(claim);
    if (blockers.length > 0) {
      return block(
        input,
        "block_incomplete_embodiment_claim",
        blockers,
        "complete the executable behavior and future-routing receipt before release",
        [...releaseEvidence, ...claimEvidence(claim)],
      );
    }
  }

  if (claim.progress_class === "fresh_status_readback" && (claim.status_surface_ids ?? []).length === 0) {
    return block(
      input,
      "block_incomplete_status_claim",
      ["fresh status readback claim has no status surface id"],
      "attach a head-bound status surface before claiming status progress",
      [...releaseEvidence, ...claimEvidence(claim)],
    );
  }

  if (claim.progress_class === "exact_external_blocker" && !claim.exact_blocker?.trim()) {
    return block(
      input,
      "block_incomplete_blocker_claim",
      ["exact external blocker claim has no blocker text"],
      "name the exact external blocker or choose a real external act",
      [...releaseEvidence, ...claimEvidence(claim)],
    );
  }

  const exactBlocker = claim.progress_class === "exact_external_blocker";
  return {
    ...base(input),
    ok: true,
    action: exactBlocker ? "emit_single_exact_external_blocker" : "admit_single_external_progress_act",
    admitted_claim_id: claim.claim_id,
    admitted_progress_class: claim.progress_class,
    decisive_evidence: [...releaseEvidence, ...claimEvidence(claim)],
    blockers: exactBlocker ? [claim.exact_blocker ?? "exact external blocker"] : [],
    next_route: exactBlocker
      ? "remove the named blocker before opening another progress release"
      : "after this single act, any moved head or status change must enter a new release fuse",
  };
}
