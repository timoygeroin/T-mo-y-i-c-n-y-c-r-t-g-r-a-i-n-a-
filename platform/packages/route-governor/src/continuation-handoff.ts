import type { ContinuationMoveInput, ContinuationStatusReceiptSurface } from "./index.js";

export type ContinuationHandoffAction =
  | "read_current_head_status"
  | "commit_external_embodiment"
  | "emit_exact_blocker"
  | "block_release";

export interface ContinuationHandoffCandidate {
  candidate_id: string;
  input: ContinuationMoveInput;
}

export interface RejectedContinuationHandoffCandidate {
  candidate_id: string;
  reasons: string[];
}

export interface ContinuationHandoffInput {
  branch: string;
  active_branch: string;
  current_head_sha: string;
  last_released_head_sha: string;
  status_surface?: ContinuationStatusReceiptSurface;
  candidates: ContinuationHandoffCandidate[];
}

export interface ContinuationHandoffVerdict {
  ok: boolean;
  branch: string;
  head_sha: string;
  action: ContinuationHandoffAction;
  status_claim_allowed: boolean;
  selected_candidate_id: string | null;
  decisive_evidence: string[];
  rejected: RejectedContinuationHandoffCandidate[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

const SPENT_MOVE_CLASSES = new Set<ContinuationMoveInput["move_class"]>([
  "duplicate_status_readback",
  "duplicate_comment",
  "internal_memory_guard",
  "metadata_reread",
]);

function isExecutablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function executableChanges(input: ContinuationMoveInput): string[] {
  return input.changed_files.filter(isExecutablePlatformPath);
}

function statusBlockers(statusSurface: ContinuationStatusReceiptSurface): string[] {
  if (statusSurface.blocking_failures.length > 0) return statusSurface.blocking_failures;
  if (statusSurface.pending_surfaces.length > 0) return statusSurface.pending_surfaces;
  if (statusSurface.decisive_successes.length === 0) return ["current-head status surface returned no decisive success evidence"];
  return [];
}

function rejectCandidate(candidate: ContinuationHandoffCandidate): string[] {
  const failures: string[] = [];
  const { input } = candidate;

  if (SPENT_MOVE_CLASSES.has(input.move_class)) {
    failures.push(`candidate repeats spent continuation class: ${input.move_class}`);
  }

  if (input.move_class === "fresh_status_readback") {
    failures.push("fresh status readback is selected by head movement, not by a candidate after handoff compilation");
  }

  if (input.move_class === "external_platform_embodiment") {
    if (executableChanges(input).length === 0) {
      failures.push("external embodiment candidate has no executable platform file change");
    }
    if (input.executable_artifacts.length === 0) {
      failures.push("external embodiment candidate has no executable artifact");
    }
    if (input.routing_artifacts.length === 0) {
      failures.push("external embodiment candidate has no future-routing artifact");
    }
  }

  if (input.move_class === "exact_external_blocker" && !input.blocker?.trim()) {
    failures.push("exact external blocker candidate does not name the blocker");
  }

  return failures;
}

export function compileContinuationHandoff(input: ContinuationHandoffInput): ContinuationHandoffVerdict {
  const warnings = input.status_surface?.non_blocking_warnings ?? [];

  if (input.branch !== input.active_branch) {
    return {
      ok: false,
      branch: input.branch,
      head_sha: input.current_head_sha,
      action: "block_release",
      status_claim_allowed: false,
      selected_candidate_id: null,
      decisive_evidence: [],
      rejected: [],
      blockers: [`handoff branch ${input.branch} does not match active branch ${input.active_branch}`],
      warnings,
      next_route: "rebind the handoff to the active PR branch before release",
    };
  }

  if (input.current_head_sha !== input.last_released_head_sha && !input.status_surface) {
    return {
      ok: true,
      branch: input.branch,
      head_sha: input.current_head_sha,
      action: "read_current_head_status",
      status_claim_allowed: false,
      selected_candidate_id: null,
      decisive_evidence: [`head moved from ${input.last_released_head_sha} to ${input.current_head_sha}`],
      rejected: [],
      blockers: [],
      warnings,
      next_route: "read the moved head status surface before releasing another verdict or embodiment plan",
    };
  }

  if (input.status_surface && !input.status_surface.ok) {
    return {
      ok: false,
      branch: input.branch,
      head_sha: input.current_head_sha,
      action: "block_release",
      status_claim_allowed: false,
      selected_candidate_id: null,
      decisive_evidence: [],
      rejected: [],
      blockers: statusBlockers(input.status_surface),
      warnings,
      next_route: input.status_surface.pending_surfaces.length > 0 ? "wait for current-head checks to complete" : "repair the current-head status blocker",
    };
  }

  const rejected: RejectedContinuationHandoffCandidate[] = [];
  const embodimentCandidates: ContinuationHandoffCandidate[] = [];
  const blockerCandidates: ContinuationHandoffCandidate[] = [];

  for (const candidate of input.candidates) {
    const failures = rejectCandidate(candidate);
    if (failures.length > 0) {
      rejected.push({ candidate_id: candidate.candidate_id, reasons: failures });
      continue;
    }

    if (candidate.input.move_class === "external_platform_embodiment") {
      embodimentCandidates.push(candidate);
      continue;
    }

    if (candidate.input.move_class === "exact_external_blocker") {
      blockerCandidates.push(candidate);
    }
  }

  const selectedEmbodiment = embodimentCandidates[0];
  if (selectedEmbodiment) {
    return {
      ok: true,
      branch: input.branch,
      head_sha: input.current_head_sha,
      action: "commit_external_embodiment",
      status_claim_allowed: Boolean(input.status_surface?.ok),
      selected_candidate_id: selectedEmbodiment.candidate_id,
      decisive_evidence: [
        ...executableChanges(selectedEmbodiment.input),
        ...selectedEmbodiment.input.executable_artifacts,
        ...selectedEmbodiment.input.routing_artifacts,
      ],
      rejected,
      blockers: [],
      warnings,
      next_route: "commit the selected executable embodiment and bind the next status claim to the moved head",
    };
  }

  const selectedBlocker = blockerCandidates[0];
  if (selectedBlocker) {
    return {
      ok: true,
      branch: input.branch,
      head_sha: input.current_head_sha,
      action: "emit_exact_blocker",
      status_claim_allowed: Boolean(input.status_surface?.ok),
      selected_candidate_id: selectedBlocker.candidate_id,
      decisive_evidence: [selectedBlocker.input.blocker ?? "exact external blocker supplied"],
      rejected,
      blockers: [selectedBlocker.input.blocker ?? "exact external blocker supplied"],
      warnings,
      next_route: "remove the named blocker before compiling another continuation handoff",
    };
  }

  return {
    ok: false,
    branch: input.branch,
    head_sha: input.current_head_sha,
    action: "block_release",
    status_claim_allowed: Boolean(input.status_surface?.ok),
    selected_candidate_id: null,
    decisive_evidence: [],
    rejected,
    blockers: ["no executable embodiment candidate or exact external blocker survived continuation handoff compilation"],
    warnings,
    next_route: "provide a non-repeated executable platform candidate or one exact external blocker",
  };
}
