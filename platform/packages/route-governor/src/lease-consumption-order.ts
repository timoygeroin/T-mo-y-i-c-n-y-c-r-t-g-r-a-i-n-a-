export type LeaseConsumptionKind =
  | "post_write_status_escrow"
  | "status_surface"
  | "review_feedback_delta"
  | "mergeability_lease"
  | "release_candidate_bundle";

export type LeaseConsumptionNextAction =
  | "review_request"
  | "merge_command"
  | "finalization_surface_promotion"
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "metadata_reread"
  | "duplicate_status_summary"
  | "duplicate_comment";

export type LeaseConsumptionOrderAction =
  | "admit_lease_consumption_order"
  | "block_reused_plan"
  | "block_branch_mismatch"
  | "block_stale_head"
  | "block_failed_lease"
  | "block_missing_required_lease"
  | "block_duplicate_required_lease"
  | "block_non_monotonic_order"
  | "block_non_progress_action";

export interface LeaseConsumptionSurface {
  lease_id: string;
  kind: LeaseConsumptionKind;
  branch: string;
  head_sha: string;
  ok: boolean;
  observed_sequence: number;
  evidence: string[];
  blockers: string[];
}

export interface LeaseConsumptionOrderInput {
  active_branch: string;
  live_head_sha: string;
  plan_id: string;
  spent_plan_ids: string[];
  requested_next_action: LeaseConsumptionNextAction;
  required_order: LeaseConsumptionKind[];
  leases: LeaseConsumptionSurface[];
}

export interface OrderedLeaseConsumption {
  sequence: number;
  lease_id: string;
  kind: LeaseConsumptionKind;
  observed_sequence: number;
}

export interface LeaseConsumptionOrderVerdict {
  ok: boolean;
  action: LeaseConsumptionOrderAction;
  plan_id: string | null;
  branch: string;
  head_sha: string;
  ordered_leases: OrderedLeaseConsumption[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_ACTIONS = new Set<LeaseConsumptionNextAction>([
  "metadata_reread",
  "duplicate_status_summary",
  "duplicate_comment",
]);

function normalizeKinds(kinds: LeaseConsumptionKind[]): LeaseConsumptionKind[] {
  return [...new Set(kinds)];
}

function base(input: LeaseConsumptionOrderInput): Pick<LeaseConsumptionOrderVerdict, "plan_id" | "branch" | "head_sha"> {
  return {
    plan_id: input.plan_id.trim() || null,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
  };
}

function block(
  input: LeaseConsumptionOrderInput,
  action: Exclude<LeaseConsumptionOrderAction, "admit_lease_consumption_order">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): LeaseConsumptionOrderVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    ordered_leases: [],
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function leaseEvidence(lease: LeaseConsumptionSurface): string[] {
  return [lease.lease_id, lease.kind, `observed ${lease.observed_sequence}`, ...lease.evidence];
}

function requiredLease(input: LeaseConsumptionOrderInput, kind: LeaseConsumptionKind): LeaseConsumptionSurface | null {
  const matches = input.leases.filter((lease) => lease.kind === kind);
  return matches.length === 1 ? matches[0] : null;
}

export function compileLeaseConsumptionOrder(input: LeaseConsumptionOrderInput): LeaseConsumptionOrderVerdict {
  const planId = input.plan_id.trim();
  const requiredOrder = normalizeKinds(input.required_order);
  const planEvidence = [`plan ${planId || "<missing>"}`, `live head ${input.live_head_sha}`];

  if (!planId || input.spent_plan_ids.includes(planId)) {
    return block(
      input,
      "block_reused_plan",
      [planId ? `lease consumption plan already spent: ${planId}` : "lease consumption plan has no id"],
      "issue a fresh lease consumption plan id before consuming live-head leases",
      planEvidence,
    );
  }

  if (NON_PROGRESS_ACTIONS.has(input.requested_next_action)) {
    return block(
      input,
      "block_non_progress_action",
      [`${input.requested_next_action} cannot consume live-head leases as progress`],
      "choose review request, merge command, promotion, embodiment, status readback, or one exact blocker",
      planEvidence,
    );
  }

  const branchMismatch = input.leases.find((lease) => lease.branch !== input.active_branch);
  if (branchMismatch) {
    return block(
      input,
      "block_branch_mismatch",
      [`lease ${branchMismatch.lease_id} is on ${branchMismatch.branch}, not ${input.active_branch}`],
      "rebuild the consumption order from leases on the active branch only",
      [...planEvidence, ...leaseEvidence(branchMismatch)],
    );
  }

  const staleHead = input.leases.find((lease) => lease.head_sha !== input.live_head_sha);
  if (staleHead) {
    return block(
      input,
      "block_stale_head",
      [`lease ${staleHead.lease_id} belongs to ${staleHead.head_sha}, not live head ${input.live_head_sha}`],
      "refresh every lease against the same live head before consumption",
      [...planEvidence, ...leaseEvidence(staleHead)],
    );
  }

  const failedLease = input.leases.find((lease) => !lease.ok || lease.blockers.length > 0);
  if (failedLease) {
    return block(
      input,
      "block_failed_lease",
      failedLease.blockers.length > 0 ? failedLease.blockers : [`lease ${failedLease.lease_id} is not admitted`],
      "resolve the failed live-head lease before building a consumption order",
      [...planEvidence, ...leaseEvidence(failedLease)],
    );
  }

  const missing = requiredOrder.filter((kind) => !input.leases.some((lease) => lease.kind === kind));
  if (missing.length > 0) {
    return block(
      input,
      "block_missing_required_lease",
      missing.map((kind) => `missing required lease before ${input.requested_next_action}: ${kind}`),
      "collect every required live-head lease before consuming release authority",
      planEvidence,
    );
  }

  const duplicateKinds = requiredOrder.filter((kind) => input.leases.filter((lease) => lease.kind === kind).length > 1);
  if (duplicateKinds.length > 0) {
    return block(
      input,
      "block_duplicate_required_lease",
      duplicateKinds.map((kind) => `multiple leases supplied for required kind: ${kind}`),
      "collapse each required lease kind to exactly one live-head authority surface before consumption",
      planEvidence,
    );
  }

  const ordered = requiredOrder.map((kind, index) => {
    const lease = requiredLease(input, kind);
    if (!lease) throw new Error(`required lease disappeared during ordering: ${kind}`);
    return {
      sequence: index + 1,
      lease_id: lease.lease_id,
      kind: lease.kind,
      observed_sequence: lease.observed_sequence,
    };
  });

  const nonMonotonic = ordered.find((lease, index) => {
    if (!Number.isInteger(lease.observed_sequence) || lease.observed_sequence < 1) return true;
    const previous = ordered[index - 1];
    return Boolean(previous && previous.observed_sequence >= lease.observed_sequence);
  });

  if (nonMonotonic) {
    return block(
      input,
      "block_non_monotonic_order",
      [`lease ${nonMonotonic.lease_id} does not preserve the required live-head observation order`],
      "refresh the stale or out-of-order lease before consuming release authority",
      [...planEvidence, nonMonotonic.lease_id],
    );
  }

  const admittedLeases = ordered.map((orderedLease) => {
    const lease = requiredLease(input, orderedLease.kind);
    if (!lease) throw new Error(`required lease disappeared during evidence compilation: ${orderedLease.kind}`);
    return lease;
  });

  return {
    ...base(input),
    ok: true,
    action: "admit_lease_consumption_order",
    ordered_leases: ordered,
    decisive_evidence: [
      ...planEvidence,
      `next action ${input.requested_next_action}`,
      ...admittedLeases.flatMap(leaseEvidence),
    ],
    blockers: [],
    next_route: "consume leases in this order only while branch, head, plan id, and requested next action remain unchanged",
  };
}
