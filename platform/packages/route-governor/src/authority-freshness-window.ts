export type AuthorityFreshnessLeaseKind =
  | "status_lease"
  | "mergeability_lease"
  | "review_lease"
  | "blocker_retirement";

export type AuthorityInvalidationKind =
  | "status_rerun_started"
  | "review_dismissed"
  | "review_changes_requested"
  | "blocker_reopened"
  | "head_mutation_detected";

export type AuthorityFreshnessAction =
  | "admit_authority_freshness_window"
  | "expire_stale_same_head_authority"
  | "block_branch_mismatch"
  | "block_head_mismatch"
  | "block_missing_required_lease"
  | "block_unparseable_timestamp";

export interface AuthorityFreshnessLease {
  lease_id: string;
  kind: AuthorityFreshnessLeaseKind;
  branch: string;
  head_sha: string;
  observed_at: string;
  evidence: string[];
}

export interface AuthorityInvalidationEvent {
  event_id: string;
  kind: AuthorityInvalidationKind;
  branch: string;
  head_sha: string;
  occurred_at: string;
  evidence: string[];
}

export interface AuthorityFreshnessWindowInput {
  active_branch: string;
  live_head_sha: string;
  required_lease_kinds: AuthorityFreshnessLeaseKind[];
  leases: AuthorityFreshnessLease[];
  invalidation_events: AuthorityInvalidationEvent[];
}

export interface AuthorityFreshnessWindowVerdict {
  ok: boolean;
  action: AuthorityFreshnessAction;
  branch: string;
  head_sha: string;
  admitted_lease_ids: string[];
  expired_lease_ids: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function parseTime(label: string, value: string): number | string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? `${label} has unparseable timestamp: ${value}` : parsed;
}

function leaseEvidence(lease: AuthorityFreshnessLease): string[] {
  return [lease.lease_id, lease.kind, lease.observed_at, ...lease.evidence];
}

function eventEvidence(event: AuthorityInvalidationEvent): string[] {
  return [event.event_id, event.kind, event.occurred_at, ...event.evidence];
}

function block(
  input: AuthorityFreshnessWindowInput,
  action: Exclude<AuthorityFreshnessAction, "admit_authority_freshness_window" | "expire_stale_same_head_authority">,
  blockers: string[],
  evidence: string[] = [],
): AuthorityFreshnessWindowVerdict {
  return {
    ok: false,
    action,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    admitted_lease_ids: [],
    expired_lease_ids: [],
    decisive_evidence: evidence,
    blockers,
    next_route: "rebuild authority from live-branch, live-head surfaces before consuming review or merge routing",
  };
}

export function compileAuthorityFreshnessWindow(
  input: AuthorityFreshnessWindowInput,
): AuthorityFreshnessWindowVerdict {
  const wrongBranchLease = input.leases.find((lease) => lease.branch !== input.active_branch);
  if (wrongBranchLease) {
    return block(
      input,
      "block_branch_mismatch",
      [`lease ${wrongBranchLease.lease_id} is on ${wrongBranchLease.branch}, not ${input.active_branch}`],
      leaseEvidence(wrongBranchLease),
    );
  }

  const wrongBranchEvent = input.invalidation_events.find((event) => event.branch !== input.active_branch);
  if (wrongBranchEvent) {
    return block(
      input,
      "block_branch_mismatch",
      [`invalidation event ${wrongBranchEvent.event_id} is on ${wrongBranchEvent.branch}, not ${input.active_branch}`],
      eventEvidence(wrongBranchEvent),
    );
  }

  const wrongHeadLease = input.leases.find((lease) => lease.head_sha !== input.live_head_sha);
  if (wrongHeadLease) {
    return block(
      input,
      "block_head_mismatch",
      [`lease ${wrongHeadLease.lease_id} belongs to ${wrongHeadLease.head_sha}, not live head ${input.live_head_sha}`],
      leaseEvidence(wrongHeadLease),
    );
  }

  const wrongHeadEvent = input.invalidation_events.find((event) => event.head_sha !== input.live_head_sha);
  if (wrongHeadEvent) {
    return block(
      input,
      "block_head_mismatch",
      [`invalidation event ${wrongHeadEvent.event_id} belongs to ${wrongHeadEvent.head_sha}, not live head ${input.live_head_sha}`],
      eventEvidence(wrongHeadEvent),
    );
  }

  const missingKinds = unique(input.required_lease_kinds).filter(
    (kind) => !input.leases.some((lease) => lease.kind === kind),
  );
  if (missingKinds.length > 0) {
    return block(
      input,
      "block_missing_required_lease",
      missingKinds.map((kind) => `missing authority lease: ${kind}`),
      missingKinds,
    );
  }

  const parseFailures = [
    ...input.leases.map((lease) => parseTime(`lease ${lease.lease_id}`, lease.observed_at)),
    ...input.invalidation_events.map((event) => parseTime(`invalidation event ${event.event_id}`, event.occurred_at)),
  ].filter((value): value is string => typeof value === "string");
  if (parseFailures.length > 0) {
    return block(input, "block_unparseable_timestamp", parseFailures, parseFailures);
  }

  const latestInvalidation = input.invalidation_events
    .map((event) => ({ event, occurred: Date.parse(event.occurred_at) }))
    .sort((left, right) => right.occurred - left.occurred)[0];

  const staleLeases = latestInvalidation
    ? input.leases.filter((lease) => Date.parse(lease.observed_at) < latestInvalidation.occurred)
    : [];

  if (staleLeases.length > 0 && latestInvalidation) {
    return {
      ok: false,
      action: "expire_stale_same_head_authority",
      branch: input.active_branch,
      head_sha: input.live_head_sha,
      admitted_lease_ids: [],
      expired_lease_ids: staleLeases.map((lease) => lease.lease_id),
      decisive_evidence: [
        ...eventEvidence(latestInvalidation.event),
        ...staleLeases.flatMap(leaseEvidence),
      ],
      blockers: staleLeases.map(
        (lease) =>
          `lease ${lease.lease_id} observed at ${lease.observed_at} is older than ${latestInvalidation.event.kind} ${latestInvalidation.event.event_id}`,
      ),
      next_route: "refresh the expired same-head authority leases after the latest invalidation event",
    };
  }

  return {
    ok: true,
    action: "admit_authority_freshness_window",
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    admitted_lease_ids: input.leases.map((lease) => lease.lease_id),
    expired_lease_ids: [],
    decisive_evidence: [
      `live head ${input.live_head_sha}`,
      ...input.leases.flatMap(leaseEvidence),
      ...input.invalidation_events.flatMap(eventEvidence),
    ],
    blockers: [],
    next_route: "consume review or merge authority only until a newer same-head invalidation event appears",
  };
}
