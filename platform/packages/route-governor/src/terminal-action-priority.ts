export type TerminalActionKind =
  | "merge_finalization"
  | "request_final_review"
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "metadata_reread"
  | "duplicate_status_summary"
  | "duplicate_comment"
  | "warning_maintenance"
  | "reclose_completed_blocker";

export type TerminalAuthorityLeaseKind =
  | "status_lease"
  | "mergeability_lease"
  | "review_lease"
  | "blocker_retirement";

export type TerminalActionPriorityAction =
  | "select_merge_finalization"
  | "select_review_request"
  | "select_external_embodiment"
  | "select_fresh_status_readback"
  | "emit_exact_external_blocker"
  | "block_reused_action"
  | "block_non_progress_action"
  | "block_branch_mismatch"
  | "block_head_mismatch"
  | "block_missing_status_authority"
  | "block_status_not_passing"
  | "block_missing_required_authority"
  | "block_incomplete_embodiment"
  | "block_missing_exact_blocker";

export interface TerminalAuthorityLease {
  lease_id: string;
  kind: TerminalAuthorityLeaseKind;
  branch: string;
  head_sha: string;
  ok: boolean;
  evidence: string[];
  blockers: string[];
  warnings?: string[];
}

export interface TerminalEmbodimentCandidate {
  candidate_id: string;
  branch: string;
  base_head_sha: string;
  artifact_class: string;
  changed_files: string[];
  behavior_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
}

export interface TerminalActionPriorityInput {
  active_branch: string;
  live_head_sha: string;
  action_id: string;
  spent_action_ids: string[];
  requested_action: TerminalActionKind;
  status_verdict: "passing" | "passing_with_warnings" | "pending" | "failing" | "no_status_surface";
  leases: TerminalAuthorityLease[];
  embodiment_candidate?: TerminalEmbodimentCandidate;
  exact_blocker?: string;
}

export interface TerminalActionPriorityVerdict {
  ok: boolean;
  action: TerminalActionPriorityAction;
  branch: string;
  head_sha: string;
  action_id: string | null;
  admitted_lease_ids: string[];
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

const NON_PROGRESS_ACTIONS = new Set<TerminalActionKind>([
  "metadata_reread",
  "duplicate_status_summary",
  "duplicate_comment",
  "warning_maintenance",
  "reclose_completed_blocker",
]);

const ACTION_PRIORITY: Record<Exclude<TerminalActionKind, "metadata_reread" | "duplicate_status_summary" | "duplicate_comment" | "warning_maintenance" | "reclose_completed_blocker">, number> = {
  merge_finalization: 5,
  request_final_review: 4,
  external_platform_embodiment: 3,
  fresh_status_readback: 2,
  exact_external_blocker: 1,
};

function executableBehaviorPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs)$/.test(path) && !/(?:\.test|-proof)\.ts$/.test(path);
}

function base(input: TerminalActionPriorityInput): Pick<TerminalActionPriorityVerdict, "branch" | "head_sha" | "action_id"> {
  return {
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    action_id: input.action_id.trim() || null,
  };
}

function warnings(input: TerminalActionPriorityInput): string[] {
  return input.leases.flatMap((lease) => lease.warnings ?? []);
}

function leaseEvidence(lease: TerminalAuthorityLease): string[] {
  return [lease.lease_id, lease.kind, ...lease.evidence];
}

function block(
  input: TerminalActionPriorityInput,
  action: Exclude<
    TerminalActionPriorityAction,
    | "select_merge_finalization"
    | "select_review_request"
    | "select_external_embodiment"
    | "select_fresh_status_readback"
    | "emit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): TerminalActionPriorityVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    admitted_lease_ids: [],
    decisive_evidence: evidence,
    blockers,
    warnings: warnings(input),
    next_route: nextRoute,
  };
}

function liveLeases(input: TerminalActionPriorityInput): TerminalAuthorityLease[] {
  return input.leases.filter((lease) => lease.branch === input.active_branch && lease.head_sha === input.live_head_sha);
}

function leaseByKind(input: TerminalActionPriorityInput, kind: TerminalAuthorityLeaseKind): TerminalAuthorityLease | undefined {
  return liveLeases(input).find((lease) => lease.kind === kind);
}

function missingLeaseKinds(input: TerminalActionPriorityInput, kinds: TerminalAuthorityLeaseKind[]): TerminalAuthorityLeaseKind[] {
  return kinds.filter((kind) => !leaseByKind(input, kind));
}

function failedLiveLease(input: TerminalActionPriorityInput): TerminalAuthorityLease | undefined {
  return liveLeases(input).find((lease) => !lease.ok || lease.blockers.length > 0);
}

function embodimentBlockers(input: TerminalActionPriorityInput): string[] {
  const candidate = input.embodiment_candidate;
  const blockers: string[] = [];

  if (!candidate) return ["terminal external embodiment has no candidate"];
  if (candidate.branch !== input.active_branch) blockers.push(`embodiment branch ${candidate.branch} does not match ${input.active_branch}`);
  if (candidate.base_head_sha !== input.live_head_sha) blockers.push(`embodiment base ${candidate.base_head_sha} is not live head ${input.live_head_sha}`);
  if (!candidate.candidate_id.trim()) blockers.push("embodiment candidate has no id");
  if (!candidate.artifact_class.trim()) blockers.push("embodiment candidate has no artifact class");
  if (!candidate.changed_files.some(executableBehaviorPath)) blockers.push("embodiment candidate changes no behavior-bearing platform file");
  if (candidate.behavior_artifacts.length === 0) blockers.push("embodiment candidate has no behavior artifact");
  if (candidate.routing_artifacts.length === 0) blockers.push("embodiment candidate has no future-routing artifact");
  if (candidate.proof_artifacts.length === 0) blockers.push("embodiment candidate has no proof artifact");

  return blockers;
}

function actionEvidence(input: TerminalActionPriorityInput, action: TerminalActionKind, leases: TerminalAuthorityLease[]): string[] {
  const priority = NON_PROGRESS_ACTIONS.has(action) ? 0 : ACTION_PRIORITY[action as keyof typeof ACTION_PRIORITY];
  return [
    `terminal action ${input.action_id.trim() || "<missing>"}`,
    `requested ${action}`,
    `priority ${priority}`,
    `live head ${input.live_head_sha}`,
    ...leases.flatMap(leaseEvidence),
  ];
}

function admittedLeaseIds(leases: TerminalAuthorityLease[]): string[] {
  return leases.map((lease) => lease.lease_id);
}

export function prioritizeTerminalAction(input: TerminalActionPriorityInput): TerminalActionPriorityVerdict {
  const actionId = input.action_id.trim();
  const routeEvidence = [`terminal action ${actionId || "<missing>"}`, `live head ${input.live_head_sha}`];

  if (!actionId || input.spent_action_ids.includes(actionId)) {
    return block(
      input,
      "block_reused_action",
      [actionId ? `terminal action already spent: ${actionId}` : "terminal action has no id"],
      "issue a fresh terminal action id before consuming status, review, merge, or embodiment authority",
      routeEvidence,
    );
  }

  if (NON_PROGRESS_ACTIONS.has(input.requested_action)) {
    return block(
      input,
      "block_non_progress_action",
      [`${input.requested_action} cannot be selected as terminal progress`],
      "choose merge finalization, final review request, executable embodiment, fresh status, or one exact blocker",
      routeEvidence,
    );
  }

  const crossBranch = input.leases.find((lease) => lease.branch !== input.active_branch);
  if (crossBranch) {
    return block(
      input,
      "block_branch_mismatch",
      [`lease ${crossBranch.lease_id} is on ${crossBranch.branch}, not ${input.active_branch}`],
      "discard cross-branch authority before terminal routing",
      leaseEvidence(crossBranch),
    );
  }

  const wrongHead = input.leases.find((lease) => lease.head_sha !== input.live_head_sha);
  if (wrongHead) {
    return block(
      input,
      "block_head_mismatch",
      [`lease ${wrongHead.lease_id} belongs to ${wrongHead.head_sha}, not ${input.live_head_sha}`],
      "refresh terminal authority after every branch movement",
      leaseEvidence(wrongHead),
    );
  }

  if (input.requested_action === "exact_external_blocker") {
    const blocker = input.exact_blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_missing_exact_blocker",
        ["exact external blocker action has no blocker text"],
        "name the exact external blocker or choose an admissible terminal action",
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
      warnings: warnings(input),
      next_route: "remove the exact external blocker before any terminal progress action can consume authority",
    };
  }

  if (input.requested_action === "fresh_status_readback") {
    return {
      ...base(input),
      ok: true,
      action: "select_fresh_status_readback",
      admitted_lease_ids: [],
      decisive_evidence: routeEvidence,
      blockers: [],
      warnings: warnings(input),
      next_route: "read the live-head status surface and convert it into a status authority lease before terminal routing",
    };
  }

  const statusLease = leaseByKind(input, "status_lease");
  if (!statusLease) {
    return block(
      input,
      "block_missing_status_authority",
      [`no live-head status lease is attached for ${input.live_head_sha}`],
      "obtain a live-head status lease before review, merge, or another embodiment consumes the branch",
      routeEvidence,
    );
  }

  if (input.status_verdict === "pending" || input.status_verdict === "no_status_surface") {
    return block(
      input,
      "block_status_not_passing",
      [`status verdict is ${input.status_verdict} for ${input.live_head_sha}`],
      "wait for or read live-head status before terminal routing",
      leaseEvidence(statusLease),
    );
  }

  if (input.status_verdict === "failing") {
    return block(
      input,
      "block_status_not_passing",
      [`status verdict is failing for ${input.live_head_sha}`],
      "repair only the current-head failing status before terminal routing",
      leaseEvidence(statusLease),
    );
  }

  const failed = failedLiveLease(input);
  if (failed) {
    return block(
      input,
      "block_missing_required_authority",
      failed.blockers.length > 0 ? failed.blockers : [`lease ${failed.lease_id} is not admitted`],
      "resolve failed live-head authority before terminal routing",
      leaseEvidence(failed),
    );
  }

  if (input.requested_action === "external_platform_embodiment") {
    const blockers = embodimentBlockers(input);
    if (blockers.length > 0) {
      return block(
        input,
        "block_incomplete_embodiment",
        blockers,
        "supply a behavior-bearing executable embodiment candidate before selecting terminal embodiment progress",
        leaseEvidence(statusLease),
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "select_external_embodiment",
      admitted_lease_ids: [statusLease.lease_id],
      decisive_evidence: [
        ...actionEvidence(input, input.requested_action, [statusLease]),
        ...(input.embodiment_candidate?.changed_files.filter(executableBehaviorPath) ?? []),
        ...(input.embodiment_candidate?.behavior_artifacts ?? []),
        ...(input.embodiment_candidate?.routing_artifacts ?? []),
        ...(input.embodiment_candidate?.proof_artifacts ?? []),
      ],
      blockers: [],
      warnings: warnings(input),
      next_route: "commit the selected embodiment, then discard this status lease and read status for the resulting new head",
    };
  }

  const requiredForReview: TerminalAuthorityLeaseKind[] = ["status_lease", "mergeability_lease", "blocker_retirement"];
  const requiredForMerge: TerminalAuthorityLeaseKind[] = [
    "status_lease",
    "mergeability_lease",
    "review_lease",
    "blocker_retirement",
  ];

  const required = input.requested_action === "merge_finalization" ? requiredForMerge : requiredForReview;
  const missing = missingLeaseKinds(input, required);
  if (missing.length > 0) {
    return block(
      input,
      "block_missing_required_authority",
      missing.map((kind) => `missing terminal authority lease: ${kind}`),
      "collect live-head status, mergeability, blocker-retirement, and review authority required by the selected terminal action",
      leaseEvidence(statusLease),
    );
  }

  const admitted = required.map((kind) => leaseByKind(input, kind)).filter((lease): lease is TerminalAuthorityLease => Boolean(lease));

  if (input.requested_action === "request_final_review") {
    return {
      ...base(input),
      ok: true,
      action: "select_review_request",
      admitted_lease_ids: admittedLeaseIds(admitted),
      decisive_evidence: actionEvidence(input, input.requested_action, admitted),
      blockers: [],
      warnings: warnings(input),
      next_route: "request final review only while these leases remain bound to the live PR head",
    };
  }

  return {
    ...base(input),
    ok: true,
    action: "select_merge_finalization",
    admitted_lease_ids: admittedLeaseIds(admitted),
    decisive_evidence: actionEvidence(input, input.requested_action, admitted),
    blockers: [],
    warnings: warnings(input),
    next_route: "execute merge finalization only while status, mergeability, review, and blocker-retirement leases remain bound to this head",
  };
}
