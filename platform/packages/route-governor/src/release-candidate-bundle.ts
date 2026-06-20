export type ReleaseCandidateLeaseKind =
  | "status_surface"
  | "mergeability_lease"
  | "review_feedback_delta"
  | "post_write_status_escrow"
  | "finalization_surface_promotion";

export type ReleaseCandidateNextAction =
  | "merge_command"
  | "review_request"
  | "finalization_surface_promotion"
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "metadata_reread"
  | "duplicate_comment"
  | "duplicate_status_summary";

export type ReleaseCandidateBundleAction =
  | "admit_release_candidate_bundle"
  | "block_reused_candidate"
  | "block_branch_mismatch"
  | "block_stale_lease_head"
  | "block_failed_lease"
  | "block_missing_required_lease"
  | "block_non_progress_action";

export interface ReleaseCandidateLease {
  lease_id: string;
  kind: ReleaseCandidateLeaseKind;
  branch: string;
  head_sha: string;
  ok: boolean;
  action: string;
  evidence: string[];
  blockers: string[];
  warnings?: string[];
}

export interface ReleaseCandidateBundleInput {
  active_branch: string;
  live_head_sha: string;
  candidate_id: string;
  spent_candidate_ids: string[];
  requested_next_action: ReleaseCandidateNextAction;
  required_lease_kinds: ReleaseCandidateLeaseKind[];
  leases: ReleaseCandidateLease[];
}

export interface ReleaseCandidateBundleVerdict {
  ok: boolean;
  action: ReleaseCandidateBundleAction;
  candidate_id: string | null;
  branch: string;
  head_sha: string;
  admitted_lease_ids: string[];
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

const NON_PROGRESS_ACTIONS = new Set<ReleaseCandidateNextAction>([
  "metadata_reread",
  "duplicate_comment",
  "duplicate_status_summary",
]);

function normalizeKinds(kinds: ReleaseCandidateLeaseKind[]): ReleaseCandidateLeaseKind[] {
  return [...new Set(kinds)].sort((left, right) => left.localeCompare(right));
}

function base(input: ReleaseCandidateBundleInput): Pick<
  ReleaseCandidateBundleVerdict,
  "candidate_id" | "branch" | "head_sha"
> {
  return {
    candidate_id: input.candidate_id.trim() || null,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
  };
}

function block(
  input: ReleaseCandidateBundleInput,
  action: Exclude<ReleaseCandidateBundleAction, "admit_release_candidate_bundle">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ReleaseCandidateBundleVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    admitted_lease_ids: [],
    decisive_evidence: evidence,
    blockers,
    warnings: input.leases.flatMap((lease) => lease.warnings ?? []),
    next_route: nextRoute,
  };
}

export function compileReleaseCandidateBundle(
  input: ReleaseCandidateBundleInput,
): ReleaseCandidateBundleVerdict {
  const candidateId = input.candidate_id.trim();
  const requiredKinds = normalizeKinds(input.required_lease_kinds);
  const evidence = [`candidate ${candidateId || "<missing>"}`, `live head ${input.live_head_sha}`];

  if (!candidateId || input.spent_candidate_ids.includes(candidateId)) {
    return block(
      input,
      "block_reused_candidate",
      [candidateId ? `release candidate already spent: ${candidateId}` : "release candidate has no id"],
      "issue a fresh release candidate id before consuming live-head leases",
      evidence,
    );
  }

  if (NON_PROGRESS_ACTIONS.has(input.requested_next_action)) {
    return block(
      input,
      "block_non_progress_action",
      [`${input.requested_next_action} cannot consume a release candidate bundle as progress`],
      "choose merge command, review request, embodiment, status readback, promotion, or an exact blocker",
      evidence,
    );
  }

  const branchMismatch = input.leases.find((lease) => lease.branch !== input.active_branch);
  if (branchMismatch) {
    return block(
      input,
      "block_branch_mismatch",
      [`lease ${branchMismatch.lease_id} is on ${branchMismatch.branch}, not ${input.active_branch}`],
      "rebuild the release candidate bundle from leases on the active branch only",
      [...evidence, branchMismatch.lease_id],
    );
  }

  const staleLease = input.leases.find((lease) => lease.head_sha !== input.live_head_sha);
  if (staleLease) {
    return block(
      input,
      "block_stale_lease_head",
      [`lease ${staleLease.lease_id} belongs to ${staleLease.head_sha}, not live head ${input.live_head_sha}`],
      "refresh every release-candidate lease against the same live head before handoff",
      [...evidence, staleLease.lease_id],
    );
  }

  const failedLease = input.leases.find((lease) => !lease.ok || lease.blockers.length > 0);
  if (failedLease) {
    return block(
      input,
      "block_failed_lease",
      failedLease.blockers.length > 0 ? failedLease.blockers : [`lease ${failedLease.lease_id} is not admitted`],
      "resolve the failed lease before bundling release-candidate authority",
      [...evidence, failedLease.lease_id, failedLease.action, ...failedLease.evidence],
    );
  }

  const presentKinds = new Set(input.leases.map((lease) => lease.kind));
  const missingKinds = requiredKinds.filter((kind) => !presentKinds.has(kind));
  if (missingKinds.length > 0) {
    return block(
      input,
      "block_missing_required_lease",
      missingKinds.map((kind) => `missing required release-candidate lease: ${kind}`),
      "collect all required live-head leases before review, merge, promotion, or another embodiment consumes readiness",
      evidence,
    );
  }

  const admitted = input.leases.filter((lease) => requiredKinds.includes(lease.kind));
  return {
    ...base(input),
    ok: true,
    action: "admit_release_candidate_bundle",
    admitted_lease_ids: admitted.map((lease) => lease.lease_id),
    decisive_evidence: [
      ...evidence,
      `next action ${input.requested_next_action}`,
      ...admitted.flatMap((lease) => [lease.lease_id, lease.kind, lease.action, ...lease.evidence]),
    ],
    blockers: [],
    warnings: admitted.flatMap((lease) => lease.warnings ?? []),
    next_route: "consume this bundle only while every admitted lease remains bound to the same live head",
  };
}
