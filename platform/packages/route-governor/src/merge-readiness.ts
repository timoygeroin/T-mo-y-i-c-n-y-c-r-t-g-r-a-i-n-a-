import type { ContinuationStatusReceiptSurface } from "./index.js";

export type MergeabilityState = true | false | null | "unknown";

export type MergeReadinessAction =
  | "merge_ready"
  | "read_current_head_status"
  | "wait_for_checks"
  | "repair_status_failure"
  | "continue_external_embodiment"
  | "block_release";

export interface MergeReadinessEvidence {
  executable_artifacts: string[];
  routing_artifacts: string[];
  status_surface_ids: string[];
}

export interface MergeReadinessInput {
  repository_full_name: string;
  pr_number: number;
  branch: string;
  active_branch: string;
  head_sha: string;
  draft: boolean;
  mergeable: MergeabilityState;
  status_surface?: ContinuationStatusReceiptSurface;
  evidence: MergeReadinessEvidence;
}

export interface MergeReadinessVerdict {
  ok: boolean;
  action: MergeReadinessAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

function missingEvidence(input: MergeReadinessInput): string[] {
  const failures: string[] = [];

  if (input.evidence.executable_artifacts.length === 0) {
    failures.push("merge readiness requires at least one executable platform artifact");
  }
  if (input.evidence.routing_artifacts.length === 0) {
    failures.push("merge readiness requires at least one future-routing artifact");
  }
  if (input.status_surface?.ok && input.evidence.status_surface_ids.length === 0) {
    failures.push("passing merge readiness requires a named current-head status surface");
  }

  return failures;
}

function statusBlockers(statusSurface: ContinuationStatusReceiptSurface): string[] {
  if (statusSurface.blocking_failures.length > 0) return statusSurface.blocking_failures;
  if (statusSurface.pending_surfaces.length > 0) return statusSurface.pending_surfaces;
  if (statusSurface.decisive_successes.length === 0) return ["current-head status surface returned no decisive success evidence"];
  return [];
}

export function compileMergeReadiness(input: MergeReadinessInput): MergeReadinessVerdict {
  const base = {
    repository_full_name: input.repository_full_name,
    pr_number: input.pr_number,
    branch: input.branch,
    head_sha: input.head_sha,
  };
  const warnings = input.status_surface?.non_blocking_warnings ?? [];

  if (input.branch !== input.active_branch) {
    return {
      ...base,
      ok: false,
      action: "block_release",
      decisive_evidence: [],
      blockers: [`merge readiness branch ${input.branch} does not match active branch ${input.active_branch}`],
      warnings,
      next_route: "rebind merge readiness to the active PR branch before release",
    };
  }

  if (input.draft) {
    return {
      ...base,
      ok: false,
      action: "block_release",
      decisive_evidence: [],
      blockers: ["PR is still draft and cannot be treated as merge-ready"],
      warnings,
      next_route: "mark the PR ready for review before compiling merge readiness again",
    };
  }

  if (!input.status_surface) {
    return {
      ...base,
      ok: true,
      action: "read_current_head_status",
      decisive_evidence: [`head ${input.head_sha} has no attached status surface`],
      blockers: [],
      warnings,
      next_route: "read the current-head status surface before making any merge-readiness claim",
    };
  }

  if (!input.status_surface.ok) {
    const blockers = statusBlockers(input.status_surface);
    const hasPending = input.status_surface.pending_surfaces.length > 0;

    return {
      ...base,
      ok: false,
      action: hasPending ? "wait_for_checks" : "repair_status_failure",
      decisive_evidence: blockers,
      blockers,
      warnings,
      next_route: hasPending ? "wait for current-head checks to finish" : "repair the concrete current-head status failure",
    };
  }

  const evidenceFailures = missingEvidence(input);
  if (evidenceFailures.length > 0) {
    return {
      ...base,
      ok: false,
      action: "continue_external_embodiment",
      decisive_evidence: [],
      blockers: evidenceFailures,
      warnings,
      next_route: "add a non-repeated executable embodiment artifact before requesting merge readiness",
    };
  }

  if (input.mergeable !== true) {
    return {
      ...base,
      ok: false,
      action: "block_release",
      decisive_evidence: input.status_surface.decisive_successes,
      blockers: [`GitHub mergeability is not confirmed for head ${input.head_sha}`],
      warnings,
      next_route: "resolve mergeability or rerun the PR readback after GitHub computes it",
    };
  }

  return {
    ...base,
    ok: true,
    action: "merge_ready",
    decisive_evidence: [
      ...input.status_surface.decisive_successes,
      ...input.evidence.status_surface_ids.map((id) => `current-head status surface ${id}`),
      ...input.evidence.executable_artifacts,
      ...input.evidence.routing_artifacts,
    ],
    blockers: [],
    warnings,
    next_route: "request final review or merge through the authorized GitHub boundary; do not add another embodiment guard unless a new blocker appears",
  };
}
