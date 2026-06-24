export type FinalReviewAuthorityLeaseKind =
  | "status_lease"
  | "mergeability_lease"
  | "review_lease"
  | "blocker_retirement";

export type FinalReviewAuthorityCommand =
  | "request_final_review"
  | "merge_finalization"
  | "exact_external_blocker"
  | "metadata_reread"
  | "duplicate_comment"
  | "warning_maintenance";

export type FinalReviewAuthorityBundleAction =
  | "open_final_review_authority_bundle"
  | "emit_exact_external_blocker"
  | "block_reused_bundle"
  | "block_non_progress_command"
  | "block_branch_mismatch"
  | "block_head_mismatch"
  | "block_failed_lease"
  | "block_missing_required_lease"
  | "block_missing_exact_blocker";

export interface FinalReviewAuthorityLease {
  lease_id: string;
  kind: FinalReviewAuthorityLeaseKind;
  branch: string;
  head_sha: string;
  ok: boolean;
  evidence: string[];
  blockers: string[];
  warnings?: string[];
}

export interface FinalReviewAuthorityBundleInput {
  active_branch: string;
  live_head_sha: string;
  bundle_id: string;
  spent_bundle_ids: string[];
  command: FinalReviewAuthorityCommand;
  leases: FinalReviewAuthorityLease[];
  exact_blocker?: string;
}

export interface FinalReviewAuthorityBundleVerdict {
  ok: boolean;
  action: FinalReviewAuthorityBundleAction;
  bundle_id: string | null;
  branch: string;
  head_sha: string;
  admitted_lease_ids: string[];
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

const REQUIRED_LEASE_KINDS: FinalReviewAuthorityLeaseKind[] = [
  "status_lease",
  "mergeability_lease",
  "review_lease",
  "blocker_retirement",
];

const NON_PROGRESS_COMMANDS = new Set<FinalReviewAuthorityCommand>([
  "metadata_reread",
  "duplicate_comment",
  "warning_maintenance",
]);

function base(input: FinalReviewAuthorityBundleInput): Pick<
  FinalReviewAuthorityBundleVerdict,
  "bundle_id" | "branch" | "head_sha"
> {
  return {
    bundle_id: input.bundle_id.trim() || null,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
  };
}

function leaseWarnings(input: FinalReviewAuthorityBundleInput): string[] {
  return input.leases.flatMap((lease) => lease.warnings ?? []);
}

function leaseEvidence(lease: FinalReviewAuthorityLease): string[] {
  return [lease.lease_id, lease.kind, ...lease.evidence];
}

function block(
  input: FinalReviewAuthorityBundleInput,
  action: Exclude<
    FinalReviewAuthorityBundleAction,
    "open_final_review_authority_bundle" | "emit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): FinalReviewAuthorityBundleVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    admitted_lease_ids: [],
    decisive_evidence: evidence,
    blockers,
    warnings: leaseWarnings(input),
    next_route: nextRoute,
  };
}

export function compileFinalReviewAuthorityBundle(
  input: FinalReviewAuthorityBundleInput,
): FinalReviewAuthorityBundleVerdict {
  const bundleId = input.bundle_id.trim();
  const routeEvidence = [`bundle ${bundleId || "<missing>"}`, `live head ${input.live_head_sha}`];

  if (!bundleId || input.spent_bundle_ids.includes(bundleId)) {
    return block(
      input,
      "block_reused_bundle",
      [bundleId ? `final review authority bundle already spent: ${bundleId}` : "final review authority bundle has no id"],
      "issue a fresh bundle id before final review authority can be consumed",
      routeEvidence,
    );
  }

  if (NON_PROGRESS_COMMANDS.has(input.command)) {
    return block(
      input,
      "block_non_progress_command",
      [`${input.command} cannot consume final review authority as progress`],
      "choose final review request, merge finalization, or one exact external blocker",
      [...routeEvidence, `command ${input.command}`],
    );
  }

  if (input.command === "exact_external_blocker") {
    const blocker = input.exact_blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_missing_exact_blocker",
        ["final review authority exact-blocker command has no blocker text"],
        "name the exact external blocker or supply live-head authority leases",
        routeEvidence,
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_exact_external_blocker",
      admitted_lease_ids: [],
      decisive_evidence: [...routeEvidence, blocker],
      blockers: [blocker],
      warnings: leaseWarnings(input),
      next_route: "remove the named blocker before consuming final review authority",
    };
  }

  const wrongBranch = input.leases.find((lease) => lease.branch !== input.active_branch);
  if (wrongBranch) {
    return block(
      input,
      "block_branch_mismatch",
      [`lease ${wrongBranch.lease_id} is on ${wrongBranch.branch}, not ${input.active_branch}`],
      "rebuild final review authority from active-branch leases only",
      [...routeEvidence, ...leaseEvidence(wrongBranch)],
    );
  }

  const wrongHead = input.leases.find((lease) => lease.head_sha !== input.live_head_sha);
  if (wrongHead) {
    return block(
      input,
      "block_head_mismatch",
      [`lease ${wrongHead.lease_id} belongs to ${wrongHead.head_sha}, not live head ${input.live_head_sha}`],
      "discard stale leases and rebuild final review authority from the live PR head",
      [...routeEvidence, ...leaseEvidence(wrongHead)],
    );
  }

  const failedLease = input.leases.find((lease) => !lease.ok || lease.blockers.length > 0);
  if (failedLease) {
    return block(
      input,
      "block_failed_lease",
      failedLease.blockers.length > 0 ? failedLease.blockers : [`lease ${failedLease.lease_id} is not admitted`],
      "resolve the failed lease before opening final review authority",
      [...routeEvidence, ...leaseEvidence(failedLease)],
    );
  }

  const presentKinds = new Set(input.leases.map((lease) => lease.kind));
  const missingKinds = REQUIRED_LEASE_KINDS.filter((kind) => !presentKinds.has(kind));
  if (missingKinds.length > 0) {
    return block(
      input,
      "block_missing_required_lease",
      missingKinds.map((kind) => `missing final review authority lease: ${kind}`),
      "collect status, mergeability, review, and blocker-retirement leases before final review or merge finalization",
      routeEvidence,
    );
  }

  const admitted = REQUIRED_LEASE_KINDS.map((kind) => input.leases.find((lease) => lease.kind === kind));
  const admittedLeases = admitted.filter((lease): lease is FinalReviewAuthorityLease => Boolean(lease));

  return {
    ...base(input),
    ok: true,
    action: "open_final_review_authority_bundle",
    admitted_lease_ids: admittedLeases.map((lease) => lease.lease_id),
    decisive_evidence: [
      ...routeEvidence,
      `command ${input.command}`,
      ...admittedLeases.flatMap(leaseEvidence),
    ],
    blockers: [],
    warnings: admittedLeases.flatMap((lease) => lease.warnings ?? []),
    next_route:
      "consume this final review authority only while status, mergeability, review, and blocker-retirement leases remain bound to the same live head",
  };
}
