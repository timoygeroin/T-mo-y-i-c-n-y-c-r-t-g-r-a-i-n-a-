import { classifyStatusSurface, type StatusSurfaceClassification, type StatusSurfaceInput } from "./status-surface.js";

export type PostCommitStatusBoundaryAction =
  | "read_current_head_status"
  | "wait_for_checks"
  | "repair_status_failure"
  | "allow_next_embodiment"
  | "block_stale_status_claim"
  | "block_release";

export interface PostCommitStatusBoundaryInput {
  branch: string;
  active_branch: string;
  previous_head_sha: string;
  current_head_sha: string;
  status_surface?: StatusSurfaceInput;
  executable_artifacts: string[];
  routing_artifacts: string[];
}

export interface PostCommitStatusBoundaryVerdict {
  ok: boolean;
  action: PostCommitStatusBoundaryAction;
  branch: string;
  head_sha: string;
  status_claim_allowed: boolean;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

function statusWarnings(classification?: StatusSurfaceClassification): string[] {
  return classification?.non_blocking_warnings ?? [];
}

function statusBlockers(classification: StatusSurfaceClassification): string[] {
  if (classification.blocking_failures.length > 0) return classification.blocking_failures;
  if (classification.pending_surfaces.length > 0) return classification.pending_surfaces;
  if (classification.decisive_successes.length === 0) return ["current-head status surface returned no decisive success evidence"];
  return [];
}

function missingEmbodimentEvidence(input: PostCommitStatusBoundaryInput): string[] {
  const failures: string[] = [];

  if (input.executable_artifacts.length === 0) {
    failures.push("post-commit continuation requires the committed executable artifact before allowing another embodiment step");
  }

  if (input.routing_artifacts.length === 0) {
    failures.push("post-commit continuation requires the committed future-routing artifact before allowing another embodiment step");
  }

  return failures;
}

export function compilePostCommitStatusBoundary(input: PostCommitStatusBoundaryInput): PostCommitStatusBoundaryVerdict {
  const base = {
    branch: input.branch,
    head_sha: input.current_head_sha,
  };

  if (input.branch !== input.active_branch) {
    return {
      ...base,
      ok: false,
      action: "block_release",
      status_claim_allowed: false,
      decisive_evidence: [],
      blockers: [`post-commit status boundary branch ${input.branch} does not match active branch ${input.active_branch}`],
      warnings: [],
      next_route: "rebind post-commit status routing to the active PR branch",
    };
  }

  if (input.status_surface && input.status_surface.expected_head_sha !== input.current_head_sha) {
    return {
      ...base,
      ok: false,
      action: "block_stale_status_claim",
      status_claim_allowed: false,
      decisive_evidence: [`status surface belongs to ${input.status_surface.expected_head_sha}`],
      blockers: [`status surface head ${input.status_surface.expected_head_sha} does not match current head ${input.current_head_sha}`],
      warnings: [],
      next_route: "discard the stale status surface and read checks for the current PR head",
    };
  }

  if (input.current_head_sha !== input.previous_head_sha && !input.status_surface) {
    return {
      ...base,
      ok: true,
      action: "read_current_head_status",
      status_claim_allowed: false,
      decisive_evidence: [`head moved from ${input.previous_head_sha} to ${input.current_head_sha}`],
      blockers: [],
      warnings: [],
      next_route: "read the current-head status surface before making a pass/fail claim or selecting another embodiment",
    };
  }

  if (!input.status_surface) {
    return {
      ...base,
      ok: true,
      action: "read_current_head_status",
      status_claim_allowed: false,
      decisive_evidence: [`head ${input.current_head_sha} has no attached status surface`],
      blockers: [],
      warnings: [],
      next_route: "read the current-head status surface before making a continuation claim",
    };
  }

  const classification = classifyStatusSurface(input.status_surface);
  const warnings = statusWarnings(classification);

  if (!classification.ok) {
    const blockers = statusBlockers(classification);
    const waiting = classification.pending_surfaces.length > 0;

    return {
      ...base,
      ok: false,
      action: waiting ? "wait_for_checks" : "repair_status_failure",
      status_claim_allowed: false,
      decisive_evidence: blockers,
      blockers,
      warnings,
      next_route: waiting ? "wait for current-head checks to complete" : "repair the concrete current-head status failure",
    };
  }

  const evidenceFailures = missingEmbodimentEvidence(input);
  if (evidenceFailures.length > 0) {
    return {
      ...base,
      ok: false,
      action: "block_release",
      status_claim_allowed: true,
      decisive_evidence: classification.decisive_successes,
      blockers: evidenceFailures,
      warnings,
      next_route: "attach the committed executable and routing artifacts before selecting another embodiment step",
    };
  }

  return {
    ...base,
    ok: true,
    action: "allow_next_embodiment",
    status_claim_allowed: true,
    decisive_evidence: [
      ...classification.decisive_successes,
      ...input.executable_artifacts,
      ...input.routing_artifacts,
    ],
    blockers: [],
    warnings,
    next_route: "select the next non-repeated executable embodiment increment",
  };
}
