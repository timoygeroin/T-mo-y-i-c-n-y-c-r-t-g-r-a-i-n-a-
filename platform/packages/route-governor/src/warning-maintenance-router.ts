export type WarningMaintenanceStatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "no_status_surface";

export type WarningMaintenanceMoveClass =
  | "external_platform_embodiment"
  | "warning_maintenance"
  | "warning_repair"
  | "fresh_status_readback"
  | "duplicate_ci_summary";

export type WarningMaintenanceAction =
  | "continue_external_embodiment"
  | "queue_warning_maintenance"
  | "block_warning_as_repair"
  | "block_unstable_status"
  | "block_incomplete_maintenance"
  | "block_repeated_maintenance";

export interface WarningMaintenanceCandidate {
  maintenance_id: string;
  warning_signature: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
}

export interface WarningMaintenanceRouterInput {
  branch: string;
  active_branch: string;
  live_head_sha: string;
  status_head_sha: string;
  status_verdict: WarningMaintenanceStatusVerdict;
  non_blocking_warnings: string[];
  blocking_failures: string[];
  pending_surfaces: string[];
  requested_move_class: WarningMaintenanceMoveClass;
  candidate?: WarningMaintenanceCandidate;
  spent_maintenance_ids: string[];
}

export interface WarningMaintenanceRouterVerdict {
  ok: boolean;
  action: WarningMaintenanceAction;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_MOVE_CLASSES = new Set<WarningMaintenanceMoveClass>(["fresh_status_readback", "duplicate_ci_summary"]);

function executablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function base(input: WarningMaintenanceRouterInput): Pick<WarningMaintenanceRouterVerdict, "branch" | "head_sha"> {
  return { branch: input.branch, head_sha: input.live_head_sha };
}

function block(
  input: WarningMaintenanceRouterInput,
  action: Exclude<WarningMaintenanceAction, "continue_external_embodiment" | "queue_warning_maintenance">,
  blockers: string[],
  nextRoute: string,
): WarningMaintenanceRouterVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: [],
    blockers,
    next_route: nextRoute,
  };
}

function candidateBlockers(input: WarningMaintenanceRouterInput): string[] {
  const candidate = input.candidate;
  if (!candidate) return ["warning maintenance route has no maintenance candidate"];

  const blockers: string[] = [];
  if (!candidate.maintenance_id.trim()) blockers.push("warning maintenance candidate has no maintenance id");
  if (input.spent_maintenance_ids.includes(candidate.maintenance_id)) {
    blockers.push(`warning maintenance id already spent: ${candidate.maintenance_id}`);
  }
  if (!input.non_blocking_warnings.includes(candidate.warning_signature)) {
    blockers.push(`maintenance candidate is not bound to a current warning: ${candidate.warning_signature}`);
  }
  if (!candidate.changed_files.some(executablePlatformPath)) {
    blockers.push("warning maintenance candidate does not change executable platform files");
  }
  if (candidate.executable_artifacts.length === 0) {
    blockers.push("warning maintenance candidate has no executable artifact evidence");
  }
  if (candidate.routing_artifacts.length === 0) {
    blockers.push("warning maintenance candidate has no future-routing artifact evidence");
  }
  if (candidate.proof_artifacts.length === 0) {
    blockers.push("warning maintenance candidate has no proof artifact evidence");
  }

  return blockers;
}

export function routeWarningMaintenance(input: WarningMaintenanceRouterInput): WarningMaintenanceRouterVerdict {
  if (input.branch !== input.active_branch) {
    return block(
      input,
      "block_unstable_status",
      [`warning route branch ${input.branch} does not match active branch ${input.active_branch}`],
      "bind warning routing to the active PR branch before choosing maintenance",
    );
  }

  if (input.status_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_unstable_status",
      [`warning status belongs to ${input.status_head_sha}, not live head ${input.live_head_sha}`],
      "discard stale warning status and read the live PR head before routing warnings",
    );
  }

  if (input.status_verdict === "failing") {
    return block(
      input,
      "block_unstable_status",
      input.blocking_failures.length > 0 ? input.blocking_failures : ["current-head checks are failing"],
      "repair concrete current-head failures before warning maintenance",
    );
  }

  if (input.status_verdict === "pending") {
    return block(
      input,
      "block_unstable_status",
      input.pending_surfaces.length > 0 ? input.pending_surfaces : ["current-head checks are pending"],
      "wait for current-head checks before warning maintenance",
    );
  }

  if (input.status_verdict === "no_status_surface") {
    return block(
      input,
      "block_unstable_status",
      ["warning route has no current-head status surface"],
      "obtain a current-head status surface before routing warnings",
    );
  }

  if (input.requested_move_class === "warning_repair") {
    return block(
      input,
      "block_warning_as_repair",
      input.non_blocking_warnings.length > 0
        ? input.non_blocking_warnings.map((warning) => `non-blocking warning cannot enter repair mode: ${warning}`)
        : ["warning repair requested without a current non-blocking warning"],
      "choose external embodiment first, or queue warning maintenance as deferred maintenance",
    );
  }

  if (NON_PROGRESS_MOVE_CLASSES.has(input.requested_move_class)) {
    return block(
      input,
      "block_warning_as_repair",
      [`warning route requested non-progress move class: ${input.requested_move_class}`],
      "choose external embodiment or explicit warning maintenance, not another readback summary",
    );
  }

  if (input.requested_move_class === "external_platform_embodiment") {
    return {
      ...base(input),
      ok: true,
      action: "continue_external_embodiment",
      decisive_evidence: [
        `status ${input.status_verdict} for ${input.live_head_sha}`,
        ...input.non_blocking_warnings.map((warning) => `deferred warning: ${warning}`),
      ],
      blockers: [],
      next_route: "continue with a non-repeated executable embodiment; warnings remain deferred maintenance only",
    };
  }

  const blockers = candidateBlockers(input);
  if (input.candidate && input.spent_maintenance_ids.includes(input.candidate.maintenance_id)) {
    return block(
      input,
      "block_repeated_maintenance",
      blockers,
      "choose a warning maintenance id that has not already been spent",
    );
  }

  if (blockers.length > 0) {
    return block(
      input,
      "block_incomplete_maintenance",
      blockers,
      "supply executable warning maintenance bound to a current non-blocking warning",
    );
  }

  const candidate = input.candidate;
  return {
    ...base(input),
    ok: true,
    action: "queue_warning_maintenance",
    decisive_evidence: [
      candidate.maintenance_id,
      candidate.warning_signature,
      ...candidate.changed_files.filter(executablePlatformPath),
      ...candidate.executable_artifacts,
      ...candidate.routing_artifacts,
      ...candidate.proof_artifacts,
    ],
    blockers: [],
    next_route: "execute warning maintenance only after no stronger embodiment or failing-status route is active",
  };
}
