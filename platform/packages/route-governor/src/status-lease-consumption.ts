export type StatusLeaseConsumptionTarget =
  | "external_platform_embodiment"
  | "review_request"
  | "merge_command"
  | "warning_maintenance"
  | "fresh_status_readback"
  | "metadata_reread"
  | "duplicate_status_summary"
  | "duplicate_comment";

export type StatusLeaseConsumptionAction =
  | "consume_status_lease"
  | "block_reused_consumption"
  | "block_branch_mismatch"
  | "block_head_mismatch"
  | "block_failed_or_pending_status"
  | "block_non_progress_target"
  | "block_missing_consumption_id"
  | "block_missing_target_receipt";

export type StatusLeaseConclusion = "passing" | "passing_with_warnings" | "failing" | "pending" | "no_status_surface";

export interface StatusLeaseConsumptionReceipt {
  changed_files: string[];
  behavior_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
}

export interface StatusLeaseConsumptionInput {
  active_branch: string;
  live_head_sha: string;
  status_lease_id: string;
  consumption_id: string;
  spent_consumption_ids: string[];
  status_branch: string;
  status_head_sha: string;
  status_conclusion: StatusLeaseConclusion;
  non_blocking_warnings: string[];
  target: StatusLeaseConsumptionTarget;
  target_receipt?: StatusLeaseConsumptionReceipt;
}

export interface StatusLeaseConsumptionVerdict {
  ok: boolean;
  action: StatusLeaseConsumptionAction;
  branch: string;
  head_sha: string;
  status_lease_id: string | null;
  consumption_id: string | null;
  target: StatusLeaseConsumptionTarget;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

const NON_PROGRESS_TARGETS = new Set<StatusLeaseConsumptionTarget>([
  "fresh_status_readback",
  "metadata_reread",
  "duplicate_status_summary",
  "duplicate_comment",
]);

function behaviorPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    /\.(?:ts|js|mjs)$/.test(path) &&
    !/(?:\.test|-proof)\.ts$/.test(path)
  );
}

function base(input: StatusLeaseConsumptionInput): Pick<
  StatusLeaseConsumptionVerdict,
  "branch" | "head_sha" | "status_lease_id" | "consumption_id" | "target" | "warnings"
> {
  return {
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    status_lease_id: input.status_lease_id.trim() || null,
    consumption_id: input.consumption_id.trim() || null,
    target: input.target,
    warnings: input.non_blocking_warnings,
  };
}

function block(
  input: StatusLeaseConsumptionInput,
  action: Exclude<StatusLeaseConsumptionAction, "consume_status_lease">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): StatusLeaseConsumptionVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function receiptBlockers(input: StatusLeaseConsumptionInput): string[] {
  const receipt = input.target_receipt;
  if (!receipt) return [`${input.target} requires a target receipt before consuming status authority`];

  const blockers: string[] = [];
  if (!receipt.changed_files.some(behaviorPath)) blockers.push("target receipt changes no behavior-bearing platform file");
  if (receipt.behavior_artifacts.length === 0) blockers.push("target receipt has no behavior artifact");
  if (receipt.routing_artifacts.length === 0) blockers.push("target receipt has no future-routing artifact");
  if (receipt.proof_artifacts.length === 0) blockers.push("target receipt has no proof artifact");
  return blockers;
}

export function consumeStatusLease(input: StatusLeaseConsumptionInput): StatusLeaseConsumptionVerdict {
  const consumptionId = input.consumption_id.trim();
  const evidence = [
    `status lease ${input.status_lease_id.trim() || "<missing>"}`,
    `consumption ${consumptionId || "<missing>"}`,
    `target ${input.target}`,
    `status ${input.status_conclusion}`,
  ];

  if (!consumptionId) {
    return block(
      input,
      "block_missing_consumption_id",
      ["status lease consumption has no consumption id"],
      "issue a single-use consumption id before using status authority",
      evidence,
    );
  }

  if (input.spent_consumption_ids.includes(consumptionId)) {
    return block(
      input,
      "block_reused_consumption",
      [`status lease consumption already spent: ${consumptionId}`],
      "create a fresh consumption id for any later live-head action",
      evidence,
    );
  }

  if (input.status_branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`status lease branch ${input.status_branch} is not active branch ${input.active_branch}`],
      "consume only status authority bound to the active PR branch",
      evidence,
    );
  }

  if (input.status_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_head_mismatch",
      [`status lease head ${input.status_head_sha} is not live head ${input.live_head_sha}`],
      "discard stale status leases before consuming downstream authority",
      evidence,
    );
  }

  if (input.status_conclusion === "failing" || input.status_conclusion === "pending" || input.status_conclusion === "no_status_surface") {
    return block(
      input,
      "block_failed_or_pending_status",
      [`status lease cannot be consumed while conclusion is ${input.status_conclusion}`],
      "repair, wait for, or acquire the live-head status surface before downstream consumption",
      evidence,
    );
  }

  if (NON_PROGRESS_TARGETS.has(input.target)) {
    return block(
      input,
      "block_non_progress_target",
      [`${input.target} cannot consume a passing status lease as progress`],
      "choose one behavior-bearing downstream action or emit a separate exact blocker",
      evidence,
    );
  }

  if (input.target === "external_platform_embodiment" || input.target === "warning_maintenance") {
    const blockers = receiptBlockers(input);
    if (blockers.length > 0) {
      return block(
        input,
        "block_missing_target_receipt",
        blockers,
        "attach the behavior, routing, and proof receipt before consuming the status lease",
        evidence,
      );
    }
  }

  const receipt = input.target_receipt;
  return {
    ...base(input),
    ok: true,
    action: "consume_status_lease",
    decisive_evidence: [
      ...evidence,
      ...(receipt?.changed_files.filter(behaviorPath) ?? []),
      ...(receipt?.behavior_artifacts ?? []),
      ...(receipt?.routing_artifacts ?? []),
      ...(receipt?.proof_artifacts ?? []),
    ],
    blockers: [],
    next_route: "treat this status lease as consumed for exactly one target; branch movement or another target requires a fresh live-head lease",
  };
}
