export type SettledHeadStatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing";

export type SettledHeadMoveClass =
  | "behavior_execution_plan"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "duplicate_repaired_head_readback"
  | "duplicate_ci_summary"
  | "duplicate_comment"
  | "duplicate_label"
  | "local_memory_guard"
  | "warning_maintenance"
  | "reclose_resolved_blocker";

export type SettledHeadExecutionAction =
  | "compile_settled_head_execution_plan"
  | "admit_fresh_moved_head_readback"
  | "emit_exact_external_blocker"
  | "block_repaired_head_replay"
  | "block_non_progress_class"
  | "block_branch_mismatch"
  | "block_stale_base_head"
  | "block_unsettled_repair_boundary"
  | "block_live_status_not_ready"
  | "block_incomplete_execution_plan"
  | "block_missing_exact_blocker";

export interface SettledHeadCheckRunEvidence {
  id: string;
  name: string;
  head_sha: string;
}

export interface SettledHeadExecutionCandidate {
  candidate_id: string;
  move_class: SettledHeadMoveClass;
  branch: string;
  base_head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  new_check_runs: SettledHeadCheckRunEvidence[];
  blocker?: string;
}

export interface SettledHeadExecutionPlanInput {
  active_branch: string;
  live_head_sha: string;
  settled_repaired_head_sha: string;
  last_status_readback_head_sha: string;
  repaired_boundary_resolved: boolean;
  live_status_verdict: SettledHeadStatusVerdict;
  non_blocking_warnings: string[];
  candidate: SettledHeadExecutionCandidate;
}

export interface SettledHeadExecutionPlan {
  ok: boolean;
  action: SettledHeadExecutionAction;
  branch: string;
  head_sha: string;
  retired_head_shas: string[];
  warning_receipts: string[];
  decisive_evidence: string[];
  blockers: string[];
  execution_order: string[];
  next_route: string;
}

const NON_PROGRESS_CLASSES = new Set<SettledHeadMoveClass>([
  "duplicate_repaired_head_readback",
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "warning_maintenance",
  "reclose_resolved_blocker",
]);

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function behaviorPlatformPath(path: string): boolean {
  return executablePlatformPath(path) && !/(?:\.test|-proof)\.ts$/.test(path);
}

function base(input: SettledHeadExecutionPlanInput): Pick<
  SettledHeadExecutionPlan,
  "branch" | "head_sha" | "retired_head_shas" | "warning_receipts"
> {
  const retired = new Set<string>();
  if (input.settled_repaired_head_sha !== input.live_head_sha) retired.add(input.settled_repaired_head_sha);
  if (input.last_status_readback_head_sha !== input.live_head_sha) retired.add(input.last_status_readback_head_sha);

  return {
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    retired_head_shas: [...retired],
    warning_receipts: input.non_blocking_warnings,
  };
}

function block(
  input: SettledHeadExecutionPlanInput,
  action: Exclude<
    SettledHeadExecutionAction,
    "compile_settled_head_execution_plan" | "admit_fresh_moved_head_readback" | "emit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): SettledHeadExecutionPlan {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    execution_order: [],
    next_route: nextRoute,
  };
}

function currentHeadCheckRuns(input: SettledHeadExecutionPlanInput): SettledHeadCheckRunEvidence[] {
  return input.candidate.new_check_runs.filter((run) => run.head_sha === input.live_head_sha);
}

function executionPlanBlockers(candidate: SettledHeadExecutionCandidate): string[] {
  const blockers: string[] = [];

  if (!candidate.candidate_id.trim()) blockers.push("settled-head execution candidate has no candidate id");
  if (!candidate.changed_files.some(executablePlatformPath)) {
    blockers.push("settled-head execution plan changes no executable platform file");
  }
  if (!candidate.changed_files.some(behaviorPlatformPath)) {
    blockers.push("settled-head execution plan has no behavior-bearing platform file");
  }
  if (candidate.executable_artifacts.length === 0) {
    blockers.push("settled-head execution plan has no executable artifact evidence");
  }
  if (candidate.routing_artifacts.length === 0) {
    blockers.push("settled-head execution plan has no future-routing artifact evidence");
  }
  if (candidate.proof_artifacts.length === 0) {
    blockers.push("settled-head execution plan has no proof artifact evidence");
  }

  return blockers;
}

export function compileSettledHeadExecutionPlan(input: SettledHeadExecutionPlanInput): SettledHeadExecutionPlan {
  const candidate = input.candidate;

  if (candidate.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`],
      "bind the execution plan to the active PR branch before release",
    );
  }

  if (!input.repaired_boundary_resolved) {
    return block(
      input,
      "block_unsettled_repair_boundary",
      ["settled repaired-head boundary has not been marked resolved"],
      "settle the repaired-head readback boundary before compiling execution plans",
    );
  }

  if (NON_PROGRESS_CLASSES.has(candidate.move_class)) {
    return block(
      input,
      candidate.move_class === "duplicate_repaired_head_readback" ? "block_repaired_head_replay" : "block_non_progress_class",
      [`settled-head move class is non-progress: ${candidate.move_class}`],
      "choose a behavior-bearing execution plan, a moved-head status readback, or one exact blocker",
      [candidate.move_class, ...input.non_blocking_warnings],
    );
  }

  if (candidate.move_class === "fresh_status_readback") {
    const movedSinceReadback = input.live_head_sha !== input.last_status_readback_head_sha;
    const freshChecks = currentHeadCheckRuns(input);

    if (!movedSinceReadback && freshChecks.length === 0) {
      return block(
        input,
        "block_repaired_head_replay",
        ["fresh status readback requires a moved PR head or new live-head check evidence"],
        "commit a behavior-bearing execution plan before another repaired-head status readback",
        [`last status readback head ${input.last_status_readback_head_sha}`],
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_fresh_moved_head_readback",
      decisive_evidence: [
        ...(movedSinceReadback ? [`head moved from ${input.last_status_readback_head_sha} to ${input.live_head_sha}`] : []),
        ...freshChecks.map((run) => `new live-head check ${run.id}: ${run.name}`),
      ],
      blockers: [],
      execution_order: [],
      next_route: "read only status/check surfaces bound to the moved live head",
    };
  }

  if (candidate.move_class === "exact_external_blocker") {
    const blocker = candidate.blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_missing_exact_blocker",
        ["settled-head exact blocker candidate has no blocker text"],
        "name one exact external blocker or choose a behavior-bearing execution plan",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_exact_external_blocker",
      decisive_evidence: [blocker, `live head ${input.live_head_sha}`],
      blockers: [blocker],
      execution_order: [],
      next_route: "remove the named external blocker before compiling another execution plan",
    };
  }

  if (candidate.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      candidate.base_head_sha === input.settled_repaired_head_sha ? "block_repaired_head_replay" : "block_stale_base_head",
      [`execution plan base ${candidate.base_head_sha} is not live head ${input.live_head_sha}`],
      "rebase the execution plan to the live PR head; keep the repaired head only as retired evidence",
      [`settled repaired head ${input.settled_repaired_head_sha}`],
    );
  }

  if (input.live_status_verdict !== "passing" && input.live_status_verdict !== "passing_with_warnings") {
    return block(
      input,
      "block_live_status_not_ready",
      [`live status verdict is ${input.live_status_verdict}`],
      "surface the exact live-head blocker before compiling a post-repair execution plan",
    );
  }

  const blockers = executionPlanBlockers(candidate);
  if (blockers.length > 0) {
    return block(
      input,
      "block_incomplete_execution_plan",
      blockers,
      "supply behavior-bearing executable, routing, and proof evidence before moving the branch",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "compile_settled_head_execution_plan",
    decisive_evidence: [
      `settled repaired head retired: ${input.settled_repaired_head_sha}`,
      ...input.non_blocking_warnings.map((warning) => `non-blocking warning preserved: ${warning}`),
      ...candidate.changed_files.filter(executablePlatformPath),
      ...candidate.executable_artifacts,
      ...candidate.routing_artifacts,
      ...candidate.proof_artifacts,
    ],
    blockers: [],
    execution_order: [
      "write behavior-bearing platform mutation",
      "write proof artifact for the mutation",
      "register the proof in proof:examples",
      "move the PR branch head",
      "read status only for the moved head",
    ],
    next_route: "execute this plan as the next branch mutation; do not spend warning-only maintenance as progress",
  };
}
