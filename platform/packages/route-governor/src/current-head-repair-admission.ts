export type RepairAdmissionStatusVerdict = "failing" | "pending" | "passing" | "passing_with_warnings" | "no_status_surface";

export type RepairAdmissionAction =
  | "admit_concrete_repair"
  | "require_current_head_status"
  | "wait_for_checks"
  | "require_failure_log_surface"
  | "block_stale_failure"
  | "block_warning_only"
  | "block_repeated_repair"
  | "block_incomplete_repair";

export interface FailureLogSurface {
  available: boolean;
  source_ids: string[];
  failing_step?: string;
  failure_signature?: string;
  assertion_or_error?: string;
}

export interface RepairAdmissionCandidate {
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  repair_class: string;
  addresses_failure_signature?: string;
}

export interface CurrentHeadRepairAdmissionInput {
  branch: string;
  active_branch: string;
  live_head_sha: string;
  failure_head_sha: string;
  status_verdict: RepairAdmissionStatusVerdict;
  blocking_failures: string[];
  pending_surfaces: string[];
  non_blocking_warnings: string[];
  failure_log_surface?: FailureLogSurface;
  candidate?: RepairAdmissionCandidate;
  spent_repair_classes: string[];
}

export interface CurrentHeadRepairAdmissionVerdict {
  ok: boolean;
  action: RepairAdmissionAction;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

function executablePlatformFile(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function hasConcreteLogSurface(surface: FailureLogSurface | undefined): surface is FailureLogSurface {
  return Boolean(
    surface?.available &&
      surface.source_ids.length > 0 &&
      surface.failing_step?.trim() &&
      (surface.failure_signature?.trim() || surface.assertion_or_error?.trim()),
  );
}

function candidateBlockers(
  candidate: RepairAdmissionCandidate | undefined,
  failureSignature: string,
  spentRepairClasses: string[],
): string[] {
  const blockers: string[] = [];

  if (!candidate) {
    return ["current-head failure has a concrete log surface but no repair candidate"];
  }
  if (!candidate.changed_files.some(executablePlatformFile)) {
    blockers.push("repair candidate does not change executable platform files");
  }
  if (candidate.executable_artifacts.length === 0) {
    blockers.push("repair candidate has no executable artifact evidence");
  }
  if (candidate.routing_artifacts.length === 0) {
    blockers.push("repair candidate has no future-routing artifact evidence");
  }
  if (candidate.proof_artifacts.length === 0) {
    blockers.push("repair candidate has no proof artifact evidence");
  }
  if (!candidate.repair_class.trim()) {
    blockers.push("repair candidate has no repair class");
  }
  if (spentRepairClasses.includes(candidate.repair_class)) {
    blockers.push(`repair candidate repeats spent repair class: ${candidate.repair_class}`);
  }
  if (candidate.addresses_failure_signature !== failureSignature) {
    blockers.push(`repair candidate does not bind to failure signature: ${failureSignature}`);
  }

  return blockers;
}

export function compileCurrentHeadRepairAdmission(
  input: CurrentHeadRepairAdmissionInput,
): CurrentHeadRepairAdmissionVerdict {
  const base = {
    branch: input.branch,
    head_sha: input.live_head_sha,
    warnings: input.non_blocking_warnings,
  };

  if (input.branch !== input.active_branch) {
    return {
      ...base,
      ok: false,
      action: "block_stale_failure",
      decisive_evidence: [],
      blockers: [`repair branch ${input.branch} does not match active branch ${input.active_branch}`],
      next_route: "bind the repair admission scene to the active PR branch before repairing",
    };
  }

  if (input.failure_head_sha !== input.live_head_sha) {
    return {
      ...base,
      ok: false,
      action: "block_stale_failure",
      decisive_evidence: [],
      blockers: [`failure belongs to ${input.failure_head_sha}, not live head ${input.live_head_sha}`],
      next_route: "discard stale failure evidence and read the live PR head status surface",
    };
  }

  if (input.status_verdict === "pending") {
    return {
      ...base,
      ok: false,
      action: "wait_for_checks",
      decisive_evidence: input.pending_surfaces,
      blockers: input.pending_surfaces.length > 0 ? input.pending_surfaces : ["current-head checks are still pending"],
      next_route: "wait for current-head checks to finish before repair admission",
    };
  }

  if (input.status_verdict === "no_status_surface") {
    return {
      ...base,
      ok: false,
      action: "require_current_head_status",
      decisive_evidence: [],
      blockers: ["current-head repair admission has no status surface"],
      next_route: "obtain a current-head status/check/readback surface before repair admission",
    };
  }

  if (input.status_verdict === "passing" || input.status_verdict === "passing_with_warnings") {
    return {
      ...base,
      ok: false,
      action: "block_warning_only",
      decisive_evidence: input.non_blocking_warnings,
      blockers: ["current-head status is not failing; warnings alone cannot enter repair mode"],
      next_route: "choose a non-repeated embodiment increment or merge-readiness route instead of repair",
    };
  }

  if (!hasConcreteLogSurface(input.failure_log_surface)) {
    return {
      ...base,
      ok: false,
      action: "require_failure_log_surface",
      decisive_evidence: input.blocking_failures,
      blockers: ["current-head failure has no concrete failing step plus assertion/log signature"],
      next_route: "obtain the failing assertion/log line before mutating executable repair code",
    };
  }

  const failureSignature = input.failure_log_surface.failure_signature || input.failure_log_surface.assertion_or_error || "";
  const blockers = candidateBlockers(input.candidate, failureSignature, input.spent_repair_classes);

  if (input.candidate && input.spent_repair_classes.includes(input.candidate.repair_class)) {
    return {
      ...base,
      ok: false,
      action: "block_repeated_repair",
      decisive_evidence: [failureSignature],
      blockers,
      next_route: "choose a repair class that has not already been spent for this platform surface",
    };
  }

  if (blockers.length > 0) {
    return {
      ...base,
      ok: false,
      action: "block_incomplete_repair",
      decisive_evidence: [failureSignature],
      blockers,
      next_route: "supply an executable repair candidate bound to the concrete current-head failure signature",
    };
  }

  return {
    ...base,
    ok: true,
    action: "admit_concrete_repair",
    decisive_evidence: [
      `current-head failure ${failureSignature}`,
      input.failure_log_surface.failing_step || "failing step surfaced",
      ...input.failure_log_surface.source_ids.map((id) => `failure log surface ${id}`),
      ...(input.candidate?.changed_files ?? []),
      ...(input.candidate?.executable_artifacts ?? []),
      ...(input.candidate?.routing_artifacts ?? []),
      ...(input.candidate?.proof_artifacts ?? []),
    ],
    blockers: [],
    next_route: "commit the concrete repair, then read only the moved head status surface",
  };
}
