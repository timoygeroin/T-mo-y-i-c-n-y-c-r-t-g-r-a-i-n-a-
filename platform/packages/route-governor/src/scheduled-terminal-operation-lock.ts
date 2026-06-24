export type ScheduledTerminalOperationClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "pr_metadata_reread"
  | "duplicate_ci_summary"
  | "duplicate_comment"
  | "duplicate_label"
  | "local_memory_guard"
  | "guessed_future_ci"
  | "reclose_resolved_blocker"
  | "old_repaired_head_blocker"
  | "warning_maintenance";

export type ScheduledTerminalOperationAction =
  | "admit_single_external_embodiment"
  | "admit_single_status_readback"
  | "emit_single_exact_blocker"
  | "block_replayed_invocation"
  | "block_operation_bundle"
  | "block_non_progress_operation"
  | "block_branch_mismatch"
  | "block_stale_operation_base"
  | "block_repaired_head_authority"
  | "block_missing_status_delta"
  | "block_incomplete_embodiment"
  | "block_missing_exact_blocker";

export type ScheduledTerminalNextAuthorityKind =
  | "moved_head_status"
  | "live_head_status"
  | "blocker_resolution"
  | "none";

export interface ScheduledTerminalNextAuthority {
  kind: ScheduledTerminalNextAuthorityKind;
  head_sha: string | null;
}

export interface ScheduledTerminalOperation {
  operation_id: string;
  operation_class: ScheduledTerminalOperationClass;
  branch: string;
  base_head_sha: string;
  changed_files: string[];
  behavior_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  status_surface_ids: string[];
  blocker?: string;
  expected_result_head_sha?: string;
}

export interface ScheduledTerminalOperationLockInput {
  invocation_id: string;
  active_branch: string;
  live_head_sha: string;
  previous_status_head_sha: string;
  previous_invocation_ids: string[];
  spent_operation_ids: string[];
  repaired_historical_heads: string[];
  operations: ScheduledTerminalOperation[];
}

export interface ScheduledTerminalOperationLockVerdict {
  ok: boolean;
  action: ScheduledTerminalOperationAction;
  branch: string;
  live_head_sha: string;
  invocation_id: string;
  selected_operation_id: string | null;
  next_required_authority: ScheduledTerminalNextAuthority;
  decisive_evidence: string[];
  blockers: string[];
  quarantined_head_shas: string[];
  next_route: string;
}

const NON_PROGRESS_CLASSES = new Set<ScheduledTerminalOperationClass>([
  "pr_metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "guessed_future_ci",
  "reclose_resolved_blocker",
  "old_repaired_head_blocker",
  "warning_maintenance",
]);

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function behaviorPath(path: string): boolean {
  return (
    executablePlatformPath(path) &&
    path !== "platform/packages/route-governor/package.json" &&
    path !== "platform/packages/route-governor/src/index.ts" &&
    !/(?:\.test|-proof)\.ts$/.test(path)
  );
}

function base(input: ScheduledTerminalOperationLockInput): Pick<
  ScheduledTerminalOperationLockVerdict,
  "branch" | "live_head_sha" | "invocation_id" | "quarantined_head_shas"
> {
  const quarantined = new Set(input.repaired_historical_heads.filter((head) => head !== input.live_head_sha));
  if (input.previous_status_head_sha !== input.live_head_sha) quarantined.add(input.previous_status_head_sha);
  for (const operation of input.operations) {
    if (operation.base_head_sha !== input.live_head_sha) quarantined.add(operation.base_head_sha);
    if (operation.expected_result_head_sha && operation.expected_result_head_sha !== input.live_head_sha) {
      quarantined.add(operation.expected_result_head_sha);
    }
  }

  return {
    branch: input.active_branch,
    live_head_sha: input.live_head_sha,
    invocation_id: input.invocation_id,
    quarantined_head_shas: [...quarantined],
  };
}

function block(
  input: ScheduledTerminalOperationLockInput,
  action: Exclude<
    ScheduledTerminalOperationAction,
    "admit_single_external_embodiment" | "admit_single_status_readback" | "emit_single_exact_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  selectedOperationId: string | null = null,
  evidence: string[] = [],
): ScheduledTerminalOperationLockVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    selected_operation_id: selectedOperationId,
    next_required_authority: { kind: "none", head_sha: null },
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function embodimentBlockers(operation: ScheduledTerminalOperation): string[] {
  const blockers: string[] = [];
  if (!operation.changed_files.some(behaviorPath)) blockers.push("scheduled terminal embodiment changes no behavior-bearing platform file");
  if (operation.behavior_artifacts.length === 0) blockers.push("scheduled terminal embodiment has no behavior artifact");
  if (operation.routing_artifacts.length === 0) blockers.push("scheduled terminal embodiment has no future-routing artifact");
  if (operation.proof_artifacts.length === 0) blockers.push("scheduled terminal embodiment has no proof artifact");
  if (operation.expected_result_head_sha && operation.expected_result_head_sha === operation.base_head_sha) {
    blockers.push("scheduled terminal embodiment expected result head must move beyond its base head");
  }
  return blockers;
}

export function lockScheduledTerminalOperation(
  input: ScheduledTerminalOperationLockInput,
): ScheduledTerminalOperationLockVerdict {
  const invocationId = input.invocation_id.trim();
  if (!invocationId || input.previous_invocation_ids.includes(invocationId)) {
    return block(
      input,
      "block_replayed_invocation",
      [invocationId ? `scheduled invocation already spent: ${invocationId}` : "scheduled invocation has no id"],
      "issue a fresh scheduled invocation id before any terminal operation can count",
      null,
      [invocationId || "<missing invocation>"],
    );
  }

  if (input.operations.length !== 1) {
    return block(
      input,
      "block_operation_bundle",
      [`scheduled invocation must release exactly one terminal operation, received ${input.operations.length}`],
      "collapse the scheduled run to one external embodiment, one fresh status readback, or one exact blocker",
    );
  }

  const operation = input.operations[0];
  const operationId = operation.operation_id.trim();
  if (!operationId || input.spent_operation_ids.includes(operationId)) {
    return block(
      input,
      "block_replayed_invocation",
      [operationId ? `scheduled terminal operation already spent: ${operationId}` : "scheduled terminal operation has no id"],
      "choose an unspent operation id bound to this invocation",
      operationId || null,
    );
  }

  if (operation.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`scheduled terminal operation branch ${operation.branch} is not ${input.active_branch}`],
      "bind the terminal operation to the active PR branch before release",
      operationId,
    );
  }

  if (NON_PROGRESS_CLASSES.has(operation.operation_class)) {
    return block(
      input,
      "block_non_progress_operation",
      [`scheduled terminal operation is not progress: ${operation.operation_class}`],
      "choose external embodiment, live-head status readback, or one exact external blocker",
      operationId,
      [operation.operation_class],
    );
  }

  if (operation.base_head_sha !== input.live_head_sha) {
    const action = input.repaired_historical_heads.includes(operation.base_head_sha)
      ? "block_repaired_head_authority"
      : "block_stale_operation_base";
    return block(
      input,
      action,
      [`scheduled terminal operation base ${operation.base_head_sha} is not live head ${input.live_head_sha}`],
      "rebase the scheduled terminal operation to the live PR head before consuming authority",
      operationId,
      [`live head ${input.live_head_sha}`, `operation base ${operation.base_head_sha}`],
    );
  }

  if (operation.operation_class === "fresh_status_readback") {
    const headMoved = input.previous_status_head_sha !== input.live_head_sha;
    if (!headMoved && operation.status_surface_ids.length === 0) {
      return block(
        input,
        "block_missing_status_delta",
        ["scheduled terminal status readback requires a moved live head or named live-head status surface"],
        "wait for new live-head status evidence or choose a behavior-bearing embodiment",
        operationId,
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_single_status_readback",
      selected_operation_id: operationId,
      next_required_authority: { kind: "live_head_status", head_sha: input.live_head_sha },
      decisive_evidence: [
        `operation ${operationId}`,
        ...(headMoved ? [`head moved from ${input.previous_status_head_sha} to ${input.live_head_sha}`] : []),
        ...operation.status_surface_ids.map((surface) => `live-head status surface ${surface}`),
      ],
      blockers: [],
      next_route: "publish exactly this live-head status readback, then spend the operation id",
    };
  }

  if (operation.operation_class === "exact_external_blocker") {
    const blocker = operation.blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_missing_exact_blocker",
        ["scheduled terminal blocker operation has no blocker text"],
        "name one exact external blocker or choose a valid terminal operation",
        operationId,
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_single_exact_blocker",
      selected_operation_id: operationId,
      next_required_authority: { kind: "blocker_resolution", head_sha: input.live_head_sha },
      decisive_evidence: [`operation ${operationId}`, blocker, `live head ${input.live_head_sha}`],
      blockers: [blocker],
      next_route: "resolve the exact blocker before another scheduled terminal operation is admitted",
    };
  }

  const blockers = embodimentBlockers(operation);
  if (blockers.length > 0) {
    return block(
      input,
      "block_incomplete_embodiment",
      blockers,
      "supply behavior, routing, and proof artifacts before moving the branch",
      operationId,
    );
  }

  const resultHead = operation.expected_result_head_sha ?? null;
  return {
    ...base(input),
    ok: true,
    action: "admit_single_external_embodiment",
    selected_operation_id: operationId,
    next_required_authority: { kind: "moved_head_status", head_sha: resultHead },
    decisive_evidence: [
      `operation ${operationId}`,
      ...operation.changed_files.filter(behaviorPath),
      ...operation.behavior_artifacts,
      ...operation.routing_artifacts,
      ...operation.proof_artifacts,
      ...(resultHead ? [`expected result head ${resultHead}`] : []),
    ],
    blockers: [],
    next_route: resultHead
      ? "after the write, read status only for the moved result head named by next_required_authority"
      : "after the write moves the branch, record the resulting head before any status claim",
  };
}
