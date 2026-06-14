export type CheckRunDeltaKind = "check_run" | "workflow_run" | "combined_status";
export type CheckRunDeltaVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "unknown";

export type CheckRunDeltaAdmissionAction =
  | "admit_fresh_status_delta"
  | "route_live_failure_delta"
  | "hold_pending_delta"
  | "block_branch_mismatch"
  | "block_stale_delta_head"
  | "block_no_fresh_delta"
  | "block_summary_only_delta";

export interface CheckRunDeltaSurface {
  surface_id: string;
  kind: CheckRunDeltaKind;
  branch: string;
  head_sha: string;
  run_id: string;
  verdict: CheckRunDeltaVerdict;
  evidence: string[];
  warnings: string[];
}

export interface CheckRunSummarySurface {
  surface_id: string;
  branch: string;
  head_sha?: string;
  evidence: string[];
}

export interface CheckRunDeltaAdmissionInput {
  active_branch: string;
  live_head_sha: string;
  previous_status_head_sha?: string;
  spent_run_ids: string[];
  direct_surfaces: CheckRunDeltaSurface[];
  summary_surfaces: CheckRunSummarySurface[];
}

export interface CheckRunDeltaAdmissionVerdict {
  ok: boolean;
  action: CheckRunDeltaAdmissionAction;
  branch: string;
  head_sha: string;
  admitted_run_ids: string[];
  stale_surface_ids: string[];
  replayed_run_ids: string[];
  summary_surface_ids: string[];
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

function base(input: CheckRunDeltaAdmissionInput): Pick<CheckRunDeltaAdmissionVerdict, "branch" | "head_sha"> {
  return { branch: input.active_branch, head_sha: input.live_head_sha };
}

function onLiveHead(input: CheckRunDeltaAdmissionInput, surface: CheckRunDeltaSurface): boolean {
  return surface.branch === input.active_branch && surface.head_sha === input.live_head_sha;
}

function staleSurfaces(input: CheckRunDeltaAdmissionInput): CheckRunDeltaSurface[] {
  return input.direct_surfaces.filter((surface) => !onLiveHead(input, surface));
}

function liveSurfaces(input: CheckRunDeltaAdmissionInput): CheckRunDeltaSurface[] {
  return input.direct_surfaces.filter((surface) => onLiveHead(input, surface));
}

function freshSurfaces(input: CheckRunDeltaAdmissionInput): CheckRunDeltaSurface[] {
  const spent = new Set(input.spent_run_ids);
  return liveSurfaces(input).filter((surface) => !spent.has(surface.run_id));
}

function replayedRunIds(input: CheckRunDeltaAdmissionInput): string[] {
  const spent = new Set(input.spent_run_ids);
  return [...new Set(liveSurfaces(input).filter((surface) => spent.has(surface.run_id)).map((surface) => surface.run_id))];
}

function evidence(surfaces: CheckRunDeltaSurface[]): string[] {
  return surfaces.flatMap((surface) => [
    `${surface.kind}:${surface.run_id}:${surface.verdict}`,
    ...surface.evidence,
  ]);
}

function warnings(surfaces: CheckRunDeltaSurface[]): string[] {
  return surfaces.flatMap((surface) => surface.warnings);
}

function block(
  input: CheckRunDeltaAdmissionInput,
  action: Exclude<
    CheckRunDeltaAdmissionAction,
    "admit_fresh_status_delta" | "route_live_failure_delta" | "hold_pending_delta"
  >,
  blockers: string[],
  nextRoute: string,
  decisive: string[] = [],
): CheckRunDeltaAdmissionVerdict {
  const stale = staleSurfaces(input);
  return {
    ...base(input),
    ok: false,
    action,
    admitted_run_ids: [],
    stale_surface_ids: stale.map((surface) => surface.surface_id),
    replayed_run_ids: replayedRunIds(input),
    summary_surface_ids: input.summary_surfaces.map((surface) => surface.surface_id),
    decisive_evidence: decisive,
    blockers,
    warnings: warnings(input.direct_surfaces),
    next_route: nextRoute,
  };
}

export function admitCheckRunDelta(input: CheckRunDeltaAdmissionInput): CheckRunDeltaAdmissionVerdict {
  const branchMismatch = input.direct_surfaces.find((surface) => surface.branch !== input.active_branch);
  if (branchMismatch) {
    return block(
      input,
      "block_branch_mismatch",
      [`status delta surface ${branchMismatch.surface_id} belongs to ${branchMismatch.branch}, not ${input.active_branch}`],
      "bind status-delta evidence to the active manifestation branch before release",
    );
  }

  const stale = staleSurfaces(input);
  if (stale.length > 0 && liveSurfaces(input).length === 0) {
    return block(
      input,
      "block_stale_delta_head",
      stale.map((surface) => `status delta ${surface.surface_id} belongs to ${surface.head_sha}, not ${input.live_head_sha}`),
      "discard stale check/workflow deltas and read the live PR head before status claims",
      evidence(stale),
    );
  }

  const fresh = freshSurfaces(input);
  if (fresh.length === 0) {
    if (input.summary_surfaces.length > 0 && input.direct_surfaces.length === 0) {
      return block(
        input,
        "block_summary_only_delta",
        input.summary_surfaces.map((surface) => `summary surface cannot count as fresh status delta: ${surface.surface_id}`),
        "obtain direct check-run, workflow-run, or combined-status ids bound to the live head",
        input.summary_surfaces.flatMap((surface) => surface.evidence),
      );
    }

    return block(
      input,
      "block_no_fresh_delta",
      ["no unspent live-head check/workflow/status run id is attached"],
      "wait for a new current-head run id or choose a non-status embodiment/blocker route",
      evidence(liveSurfaces(input)),
    );
  }

  const failing = fresh.filter((surface) => surface.verdict === "failing");
  if (failing.length > 0) {
    return {
      ...base(input),
      ok: false,
      action: "route_live_failure_delta",
      admitted_run_ids: failing.map((surface) => surface.run_id),
      stale_surface_ids: stale.map((surface) => surface.surface_id),
      replayed_run_ids: replayedRunIds(input),
      summary_surface_ids: input.summary_surfaces.map((surface) => surface.surface_id),
      decisive_evidence: evidence(failing),
      blockers: failing.flatMap((surface) =>
        surface.evidence.length > 0 ? surface.evidence : [`fresh live-head run ${surface.run_id} is failing`],
      ),
      warnings: warnings(fresh),
      next_route: "repair only the failure authorized by the fresh live-head check/workflow delta",
    };
  }

  const pending = fresh.filter((surface) => surface.verdict === "pending" || surface.verdict === "unknown");
  if (pending.length > 0) {
    return {
      ...base(input),
      ok: false,
      action: "hold_pending_delta",
      admitted_run_ids: pending.map((surface) => surface.run_id),
      stale_surface_ids: stale.map((surface) => surface.surface_id),
      replayed_run_ids: replayedRunIds(input),
      summary_surface_ids: input.summary_surfaces.map((surface) => surface.surface_id),
      decisive_evidence: evidence(pending),
      blockers: pending.map((surface) => `fresh live-head run ${surface.run_id} is ${surface.verdict}`),
      warnings: warnings(fresh),
      next_route: "wait for the fresh live-head status delta to finish before claiming status or repairing",
    };
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_fresh_status_delta",
    admitted_run_ids: fresh.map((surface) => surface.run_id),
    stale_surface_ids: stale.map((surface) => surface.surface_id),
    replayed_run_ids: replayedRunIds(input),
    summary_surface_ids: input.summary_surfaces.map((surface) => surface.surface_id),
    decisive_evidence: evidence(fresh),
    blockers: [],
    warnings: warnings(fresh),
    next_route: "record these run ids as spent, then choose a non-repeated embodiment or exact blocker from the live-head verdict",
  };
}
