export type CurrentHeadFailureIntakeAction =
  | "repair_from_actionable_failure"
  | "obtain_stronger_actions_log"
  | "wait_for_failing_status"
  | "block_stale_failure_surface"
  | "block_release";

export type FailureSurfaceSource = "public_checks_summary" | "actions_step_log" | "workflow_artifact" | "issue_readback";

export interface CurrentHeadFailureSurface {
  surface_id: string;
  source: FailureSurfaceSource;
  head_sha: string;
  check_name: string;
  failed_step?: string;
  exit_code?: number;
  annotation_count?: number;
  log_excerpt?: string;
  assertion?: string;
}

export interface CurrentHeadFailureIntakeInput {
  branch: string;
  active_branch: string;
  head_sha: string;
  status_verdict: "failing" | "pending" | "passing" | "passing_with_warnings" | "no_status_surface";
  failure_surfaces: CurrentHeadFailureSurface[];
  prior_failure_signatures: string[];
}

export interface CurrentHeadFailureIntakeVerdict {
  ok: boolean;
  action: CurrentHeadFailureIntakeAction;
  branch: string;
  head_sha: string;
  actionable_failure: string | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function signature(surface: CurrentHeadFailureSurface): string {
  return [surface.head_sha, surface.check_name, surface.failed_step ?? "<unknown-step>", surface.exit_code ?? "<unknown-exit>"]
    .join("|");
}

function hasActionableDetail(surface: CurrentHeadFailureSurface): boolean {
  return Boolean(surface.assertion?.trim() || surface.log_excerpt?.trim());
}

function compactSurface(surface: CurrentHeadFailureSurface): string {
  const details = [
    surface.check_name,
    surface.failed_step ? `step=${surface.failed_step}` : null,
    typeof surface.exit_code === "number" ? `exit=${surface.exit_code}` : null,
    typeof surface.annotation_count === "number" ? `annotations=${surface.annotation_count}` : null,
  ].filter((value): value is string => value !== null);

  return `${surface.surface_id}: ${details.join("; ")}`;
}

export function compileCurrentHeadFailureIntake(
  input: CurrentHeadFailureIntakeInput,
): CurrentHeadFailureIntakeVerdict {
  const base = {
    branch: input.branch,
    head_sha: input.head_sha,
  };

  if (input.branch !== input.active_branch) {
    return {
      ...base,
      ok: false,
      action: "block_release",
      actionable_failure: null,
      decisive_evidence: [],
      blockers: [`failure intake branch ${input.branch} does not match active branch ${input.active_branch}`],
      next_route: "rebind failure intake to the active PR branch before repair selection",
    };
  }

  const staleSurfaces = input.failure_surfaces.filter((surface) => surface.head_sha !== input.head_sha);
  if (staleSurfaces.length > 0) {
    return {
      ...base,
      ok: false,
      action: "block_stale_failure_surface",
      actionable_failure: null,
      decisive_evidence: staleSurfaces.map(compactSurface),
      blockers: staleSurfaces.map((surface) => `failure surface ${surface.surface_id} belongs to ${surface.head_sha}, not ${input.head_sha}`),
      next_route: "discard stale failure evidence and read the current-head failing surface",
    };
  }

  if (input.status_verdict !== "failing") {
    return {
      ...base,
      ok: true,
      action: "wait_for_failing_status",
      actionable_failure: null,
      decisive_evidence: [`status verdict is ${input.status_verdict}`],
      blockers: [],
      next_route: "do not compile a repair until the current head has a failing status surface",
    };
  }

  if (input.failure_surfaces.length === 0) {
    return {
      ...base,
      ok: false,
      action: "obtain_stronger_actions_log",
      actionable_failure: null,
      decisive_evidence: [],
      blockers: [`head ${input.head_sha} is failing but no current-head failure surface is attached`],
      next_route: "obtain an Actions log, readback artifact, or issue-published failure payload for the current head",
    };
  }

  const repeated = input.failure_surfaces.filter((surface) => input.prior_failure_signatures.includes(signature(surface)));
  if (repeated.length === input.failure_surfaces.length) {
    return {
      ...base,
      ok: false,
      action: "obtain_stronger_actions_log",
      actionable_failure: null,
      decisive_evidence: repeated.map(compactSurface),
      blockers: ["all attached failure surfaces repeat already-consumed failure signatures"],
      next_route: "obtain a stronger log line or assertion before repeating a repair move",
    };
  }

  const actionable = input.failure_surfaces.find((surface) => !input.prior_failure_signatures.includes(signature(surface)) && hasActionableDetail(surface));
  if (!actionable) {
    return {
      ...base,
      ok: false,
      action: "obtain_stronger_actions_log",
      actionable_failure: null,
      decisive_evidence: input.failure_surfaces.map(compactSurface),
      blockers: ["current-head failure surface has no actionable log excerpt or assertion"],
      next_route: "obtain the concrete failing assertion or log excerpt before editing code",
    };
  }

  return {
    ...base,
    ok: true,
    action: "repair_from_actionable_failure",
    actionable_failure: actionable.assertion?.trim() || actionable.log_excerpt?.trim() || null,
    decisive_evidence: [compactSurface(actionable), actionable.assertion?.trim() || actionable.log_excerpt?.trim() || ""].filter(
      (value) => value.length > 0,
    ),
    blockers: [],
    next_route: "repair only the concrete current-head failure and bind the next status readback to the moved head",
  };
}
