export type MovedHeadStatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "no_status_surface";

export type MovedHeadStatusAction =
  | "admit_moved_head_status"
  | "route_to_failure_detail"
  | "route_to_pending_status"
  | "block_stale_status_head"
  | "block_missing_status_surface"
  | "block_unproven_embodiment_move";

export interface MovedHeadEmbodimentReceipt {
  receipt_id: string;
  branch: string;
  previous_head_sha: string;
  moved_head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
}

export interface MovedHeadStatusSurface {
  surface_id: string;
  branch: string;
  head_sha: string;
  verdict: MovedHeadStatusVerdict;
  decisive_successes: string[];
  blocking_failures: string[];
  pending_surfaces: string[];
  non_blocking_warnings: string[];
}

export interface MovedHeadStatusContractInput {
  active_branch: string;
  live_head_sha: string;
  embodiment: MovedHeadEmbodimentReceipt;
  status?: MovedHeadStatusSurface;
}

export interface MovedHeadStatusContractVerdict {
  ok: boolean;
  action: MovedHeadStatusAction;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

function executablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function base(input: MovedHeadStatusContractInput): Pick<MovedHeadStatusContractVerdict, "branch" | "head_sha"> {
  return { branch: input.active_branch, head_sha: input.live_head_sha };
}

function block(
  input: MovedHeadStatusContractInput,
  action: Exclude<
    MovedHeadStatusAction,
    "admit_moved_head_status" | "route_to_failure_detail" | "route_to_pending_status"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): MovedHeadStatusContractVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    warnings: [],
    next_route: nextRoute,
  };
}

function embodimentBlockers(input: MovedHeadStatusContractInput): string[] {
  const { embodiment } = input;
  const blockers: string[] = [];

  if (embodiment.branch !== input.active_branch) {
    blockers.push(`embodiment branch ${embodiment.branch} does not match active branch ${input.active_branch}`);
  }
  if (embodiment.moved_head_sha !== input.live_head_sha) {
    blockers.push(`embodiment moved head ${embodiment.moved_head_sha} is not live head ${input.live_head_sha}`);
  }
  if (embodiment.previous_head_sha === embodiment.moved_head_sha) {
    blockers.push("embodiment receipt did not move the head");
  }
  if (!embodiment.receipt_id.trim()) blockers.push("embodiment receipt has no id");
  if (!embodiment.changed_files.some(executablePlatformPath)) {
    blockers.push("embodiment receipt has no executable platform file change");
  }
  if (embodiment.executable_artifacts.length === 0) blockers.push("embodiment receipt has no executable artifact evidence");
  if (embodiment.routing_artifacts.length === 0) blockers.push("embodiment receipt has no future-routing artifact evidence");
  if (embodiment.proof_artifacts.length === 0) blockers.push("embodiment receipt has no proof artifact evidence");

  return blockers;
}

export function enforceMovedHeadStatusContract(
  input: MovedHeadStatusContractInput,
): MovedHeadStatusContractVerdict {
  const embodimentFailures = embodimentBlockers(input);
  if (embodimentFailures.length > 0) {
    return block(
      input,
      "block_unproven_embodiment_move",
      embodimentFailures,
      "prove the executable embodiment moved the live PR head before accepting any status claim",
    );
  }

  const status = input.status;
  if (!status) {
    return block(
      input,
      "block_missing_status_surface",
      ["moved-head status contract has no status surface"],
      "obtain a status surface for the moved live head before making a pass/fail claim",
      [input.embodiment.receipt_id, input.embodiment.moved_head_sha],
    );
  }

  const staleBlockers: string[] = [];
  if (status.branch !== input.active_branch) {
    staleBlockers.push(`status branch ${status.branch} does not match active branch ${input.active_branch}`);
  }
  if (status.head_sha !== input.live_head_sha) {
    staleBlockers.push(`status head ${status.head_sha} is not live head ${input.live_head_sha}`);
  }
  if (status.head_sha !== input.embodiment.moved_head_sha) {
    staleBlockers.push(`status head ${status.head_sha} is not moved embodiment head ${input.embodiment.moved_head_sha}`);
  }
  if (staleBlockers.length > 0) {
    return block(
      input,
      "block_stale_status_head",
      staleBlockers,
      "discard stale repaired-head or pre-embodiment status before routing from the moved head",
      [input.embodiment.receipt_id, status.surface_id],
    );
  }

  const evidence = [
    input.embodiment.receipt_id,
    `head moved ${input.embodiment.previous_head_sha} -> ${input.embodiment.moved_head_sha}`,
    status.surface_id,
    `status ${status.verdict} for ${status.head_sha}`,
  ];

  if (status.verdict === "failing") {
    return {
      ...base(input),
      ok: false,
      action: "route_to_failure_detail",
      decisive_evidence: [...evidence, ...status.blocking_failures],
      blockers: status.blocking_failures.length > 0 ? status.blocking_failures : ["moved live head is failing"],
      warnings: status.non_blocking_warnings,
      next_route: "repair only the moved-head failure, then require another moved-head status contract",
    };
  }

  if (status.verdict === "pending") {
    return {
      ...base(input),
      ok: false,
      action: "route_to_pending_status",
      decisive_evidence: [...evidence, ...status.pending_surfaces],
      blockers: status.pending_surfaces.length > 0 ? status.pending_surfaces : ["moved live head status is pending"],
      warnings: status.non_blocking_warnings,
      next_route: "wait for the moved-head status surface before selecting repair or next embodiment",
    };
  }

  if (status.verdict === "no_status_surface") {
    return block(
      input,
      "block_missing_status_surface",
      ["status surface returned no checks for the moved live head"],
      "obtain a real moved-head status surface before making a status claim",
      evidence,
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_moved_head_status",
    decisive_evidence: [...evidence, ...status.decisive_successes],
    blockers: [],
    warnings: status.non_blocking_warnings,
    next_route: "use the moved-head status verdict to choose the next non-repeated embodiment, repair, or exact blocker",
  };
}
