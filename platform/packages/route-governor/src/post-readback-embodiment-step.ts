import type { ContinuationMoveInput, ContinuationStatusReceiptSurface } from "./index.js";

export type PostReadbackReleaseClass =
  | "external_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "blocked";

export type PostReadbackReleaseInstruction =
  | "commit_external_embodiment"
  | "read_current_head_status"
  | "emit_exact_blocker"
  | "block_release";

export interface PostReadbackCandidate {
  candidate_id: string;
  input: ContinuationMoveInput;
}

export interface RejectedPostReadbackCandidate {
  candidate_id: string;
  reasons: string[];
}

export interface PostReadbackEmbodimentStepInput {
  branch: string;
  current_head_sha: string;
  resolved_readback_head_sha: string;
  status_surface?: ContinuationStatusReceiptSurface;
  candidates: PostReadbackCandidate[];
}

export interface PostReadbackEmbodimentStep {
  ok: boolean;
  branch: string;
  head_sha: string;
  release_class: PostReadbackReleaseClass;
  release_instruction: PostReadbackReleaseInstruction;
  selected_candidate_id: string | null;
  decisive_evidence: string[];
  rejected: RejectedPostReadbackCandidate[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

const DUPLICATE_OR_STATUS_ONLY_CLASSES = new Set<ContinuationMoveInput["move_class"]>([
  "duplicate_status_readback",
  "duplicate_comment",
  "internal_memory_guard",
  "metadata_reread",
]);

function isExecutablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function executableEvidence(input: ContinuationMoveInput): string[] {
  return input.changed_files.filter(isExecutablePlatformPath);
}

function rejectCandidate(candidate: PostReadbackCandidate): string[] {
  const failures: string[] = [];
  const { input } = candidate;

  if (DUPLICATE_OR_STATUS_ONLY_CLASSES.has(input.move_class)) {
    failures.push(`move class is spent after repaired-head readback: ${input.move_class}`);
  }

  if (input.move_class === "fresh_status_readback") {
    failures.push("status readback cannot be the next post-readback embodiment step unless the PR head moved");
  }

  if (input.move_class === "external_platform_embodiment") {
    if (executableEvidence(input).length === 0) {
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
    failures.push("exact blocker candidate does not name the blocker");
  }

  return failures;
}

function statusBlockers(statusSurface: ContinuationStatusReceiptSurface): string[] {
  if (statusSurface.blocking_failures.length > 0) return statusSurface.blocking_failures;
  if (statusSurface.pending_surfaces.length > 0) return statusSurface.pending_surfaces;
  if (statusSurface.decisive_successes.length === 0) return ["current-head status surface returned no decisive success evidence"];
  return [];
}

export function compilePostReadbackEmbodimentStep(input: PostReadbackEmbodimentStepInput): PostReadbackEmbodimentStep {
  const warnings = input.status_surface?.non_blocking_warnings ?? [];

  if (input.current_head_sha !== input.resolved_readback_head_sha) {
    return {
      ok: true,
      branch: input.branch,
      head_sha: input.current_head_sha,
      release_class: "fresh_status_readback",
      release_instruction: "read_current_head_status",
      selected_candidate_id: null,
      decisive_evidence: [`head moved from ${input.resolved_readback_head_sha} to ${input.current_head_sha}`],
      rejected: [],
      blockers: [],
      warnings,
      next_route: "read only current-head status before making a pass/fail claim or releasing another embodiment verdict",
    };
  }

  if (input.status_surface && !input.status_surface.ok) {
    return {
      ok: false,
      branch: input.branch,
      head_sha: input.current_head_sha,
      release_class: "blocked",
      release_instruction: "block_release",
      selected_candidate_id: null,
      decisive_evidence: [],
      rejected: [],
      blockers: statusBlockers(input.status_surface),
      warnings,
      next_route: input.status_surface.pending_surfaces.length > 0 ? "wait for current-head checks to complete" : "repair the current-head status blocker",
    };
  }

  const rejected: RejectedPostReadbackCandidate[] = [];
  const executableCandidates: PostReadbackCandidate[] = [];
  const blockerCandidates: PostReadbackCandidate[] = [];

  for (const candidate of input.candidates) {
    const failures = rejectCandidate(candidate);
    if (failures.length > 0) {
      rejected.push({ candidate_id: candidate.candidate_id, reasons: failures });
      continue;
    }

    if (candidate.input.move_class === "external_platform_embodiment") {
      executableCandidates.push(candidate);
      continue;
    }

    if (candidate.input.move_class === "exact_external_blocker") {
      blockerCandidates.push(candidate);
    }
  }

  const selectedEmbodiment = executableCandidates[0];
  if (selectedEmbodiment) {
    return {
      ok: true,
      branch: input.branch,
      head_sha: input.current_head_sha,
      release_class: "external_embodiment",
      release_instruction: "commit_external_embodiment",
      selected_candidate_id: selectedEmbodiment.candidate_id,
      decisive_evidence: [
        ...executableEvidence(selectedEmbodiment.input),
        ...selectedEmbodiment.input.executable_artifacts,
        ...selectedEmbodiment.input.routing_artifacts,
      ],
      rejected,
      blockers: [],
      warnings,
      next_route: "commit the executable platform increment, then wait for the moved-head status surface before making status claims",
    };
  }

  const selectedBlocker = blockerCandidates[0];
  if (selectedBlocker) {
    return {
      ok: true,
      branch: input.branch,
      head_sha: input.current_head_sha,
      release_class: "exact_external_blocker",
      release_instruction: "emit_exact_blocker",
      selected_candidate_id: selectedBlocker.candidate_id,
      decisive_evidence: [selectedBlocker.input.blocker ?? "exact external blocker supplied"],
      rejected,
      blockers: [selectedBlocker.input.blocker ?? "exact external blocker supplied"],
      warnings,
      next_route: "remove the named blocker before attempting another post-readback embodiment step",
    };
  }

  return {
    ok: false,
    branch: input.branch,
    head_sha: input.current_head_sha,
    release_class: "blocked",
    release_instruction: "block_release",
    selected_candidate_id: null,
    decisive_evidence: [],
    rejected,
    blockers: ["no non-repeated executable embodiment candidate or exact external blocker survived post-readback compilation"],
    warnings,
    next_route: "supply an executable platform change with a future-routing artifact or name the exact external blocker",
  };
}
