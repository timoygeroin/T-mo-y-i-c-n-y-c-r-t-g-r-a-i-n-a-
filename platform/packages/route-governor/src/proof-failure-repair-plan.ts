export type ProofFailureRepairPlanAction =
  | "repair_with_bound_failure"
  | "obtain_failure_log"
  | "block_stale_repair"
  | "block_blind_repair";

export interface ProofFailureSummary {
  surface_id: string;
  head_sha: string;
  check_name: string;
  failed_step?: string;
  exit_code?: number;
  annotation_count?: number;
}

export interface ActionableProofFailure extends ProofFailureSummary {
  assertion?: string;
  log_excerpt?: string;
}

export interface ProofRepairCandidate {
  candidate_id: string;
  repair_class: string;
  head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  cited_failure: ActionableProofFailure;
}

export interface ProofFailureRepairPlanInput {
  branch: string;
  active_branch: string;
  live_head_sha: string;
  public_summary: ProofFailureSummary;
  candidate?: ProofRepairCandidate;
  spent_repair_classes: string[];
  expected_repair_paths: string[];
}

export interface ProofFailureRepairPlanVerdict {
  ok: boolean;
  action: ProofFailureRepairPlanAction;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function base(input: ProofFailureRepairPlanInput): Pick<ProofFailureRepairPlanVerdict, "branch" | "head_sha"> {
  return {
    branch: input.branch,
    head_sha: input.live_head_sha,
  };
}

function actionableFailure(failure: ActionableProofFailure | undefined): string | null {
  return failure?.assertion?.trim() || failure?.log_excerpt?.trim() || null;
}

function summaryLabel(summary: ProofFailureSummary): string {
  return [
    summary.surface_id,
    summary.check_name,
    summary.failed_step ? `step=${summary.failed_step}` : null,
    typeof summary.exit_code === "number" ? `exit=${summary.exit_code}` : null,
    typeof summary.annotation_count === "number" ? `annotations=${summary.annotation_count}` : null,
  ]
    .filter((value): value is string => value !== null)
    .join("; ");
}

function isExecutablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function candidateTouchesExpectedPath(input: ProofFailureRepairPlanInput): boolean {
  if (!input.candidate) return false;
  if (input.expected_repair_paths.length === 0) {
    return input.candidate.changed_files.some(isExecutablePlatformPath);
  }

  return input.candidate.changed_files.some((path) => input.expected_repair_paths.includes(path));
}

function candidateHasExecutableIncrement(candidate: ProofRepairCandidate): boolean {
  return candidate.changed_files.some(isExecutablePlatformPath) && candidate.executable_artifacts.length > 0;
}

export function compileProofFailureRepairPlan(input: ProofFailureRepairPlanInput): ProofFailureRepairPlanVerdict {
  if (input.branch !== input.active_branch) {
    return {
      ...base(input),
      ok: false,
      action: "block_stale_repair",
      decisive_evidence: [],
      blockers: [`proof-failure repair branch ${input.branch} does not match active branch ${input.active_branch}`],
      next_route: "rebind the repair plan to the active PR branch before editing code",
    };
  }

  if (input.public_summary.head_sha !== input.live_head_sha) {
    return {
      ...base(input),
      ok: false,
      action: "block_stale_repair",
      decisive_evidence: [summaryLabel(input.public_summary)],
      blockers: [`proof-failure summary belongs to ${input.public_summary.head_sha}, not live head ${input.live_head_sha}`],
      next_route: "discard stale proof-failure summaries and acquire the live-head failure surface",
    };
  }

  const candidate = input.candidate;
  if (!candidate) {
    return {
      ...base(input),
      ok: false,
      action: "obtain_failure_log",
      decisive_evidence: [summaryLabel(input.public_summary)],
      blockers: ["public proof-failure summary is present, but no head-bound repair candidate is supplied"],
      next_route: "obtain the failing assertion or log excerpt before selecting a repair candidate",
    };
  }

  if (input.spent_repair_classes.includes(candidate.repair_class)) {
    return {
      ...base(input),
      ok: false,
      action: "block_blind_repair",
      decisive_evidence: [candidate.repair_class],
      blockers: [`proof repair class already spent: ${candidate.repair_class}`],
      next_route: "choose a different repair class or acquire stronger failure evidence before editing",
    };
  }

  if (candidate.head_sha !== input.live_head_sha || candidate.cited_failure.head_sha !== input.live_head_sha) {
    return {
      ...base(input),
      ok: false,
      action: "block_stale_repair",
      decisive_evidence: [candidate.candidate_id, summaryLabel(candidate.cited_failure)],
      blockers: ["repair candidate or cited failure is not bound to the live PR head"],
      next_route: "bind the repair candidate and cited failure to the live PR head before release",
    };
  }

  const actionable = actionableFailure(candidate.cited_failure);
  if (!actionable) {
    return {
      ...base(input),
      ok: false,
      action: "obtain_failure_log",
      decisive_evidence: [summaryLabel(candidate.cited_failure)],
      blockers: ["repair candidate cites a proof failure without an actionable assertion or log excerpt"],
      next_route: "obtain the exact failing assertion or log excerpt before editing code",
    };
  }

  const blockers: string[] = [];
  if (!candidateHasExecutableIncrement(candidate)) {
    blockers.push("repair candidate does not change executable platform behavior");
  }
  if (candidate.routing_artifacts.length === 0) {
    blockers.push("repair candidate leaves no future-routing artifact");
  }
  if (!candidateTouchesExpectedPath(input)) {
    blockers.push("repair candidate does not touch an expected repair path");
  }

  if (blockers.length > 0) {
    return {
      ...base(input),
      ok: false,
      action: "block_blind_repair",
      decisive_evidence: [candidate.candidate_id, actionable],
      blockers,
      next_route: "supply an executable repair tied to the expected proof-failure surface before committing",
    };
  }

  return {
    ...base(input),
    ok: true,
    action: "repair_with_bound_failure",
    decisive_evidence: [
      candidate.candidate_id,
      summaryLabel(candidate.cited_failure),
      actionable,
      ...candidate.changed_files,
      ...candidate.executable_artifacts,
      ...candidate.routing_artifacts,
    ],
    blockers: [],
    next_route: "commit only the head-bound proof repair, then require a moved-head status readback",
  };
}
