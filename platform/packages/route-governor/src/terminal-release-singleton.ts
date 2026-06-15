export type TerminalReleaseClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "pr_metadata_reread"
  | "duplicate_ci_summary"
  | "duplicate_comment"
  | "duplicate_label"
  | "local_memory_guard"
  | "guessed_future_ci"
  | "reclose_resolved_blocker";

export type TerminalReleaseAction =
  | "emit_single_external_embodiment"
  | "emit_single_fresh_status_readback"
  | "emit_single_exact_blocker"
  | "block_no_terminal_release"
  | "block_ambiguous_terminal_release";

export interface TerminalReleaseCandidate {
  candidate_id: string;
  progress_class: TerminalReleaseClass;
  branch: string;
  head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  head_moved_since_last_readback?: boolean;
  new_current_head_check_ids?: string[];
  status_surface_attached?: boolean;
  blocker?: string;
}

export interface TerminalReleaseSingletonInput {
  active_branch: string;
  live_head_sha: string;
  prohibited_classes: TerminalReleaseClass[];
  candidates: TerminalReleaseCandidate[];
}

export interface TerminalReleaseRejection {
  candidate_id: string;
  reasons: string[];
}

export interface TerminalReleaseSingletonVerdict {
  ok: boolean;
  action: TerminalReleaseAction;
  branch: string;
  head_sha: string;
  selected_candidate_id: string | null;
  decisive_evidence: string[];
  rejected: TerminalReleaseRejection[];
  blockers: string[];
  next_route: string;
}

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function proofOnlyPath(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function externalEmbodimentBlockers(candidate: TerminalReleaseCandidate): string[] {
  const executableChanges = candidate.changed_files.filter(executablePlatformPath);
  const behaviorChanges = executableChanges.filter((path) => !proofOnlyPath(path));
  const blockers: string[] = [];

  if (executableChanges.length === 0) blockers.push("terminal release embodiment changes no executable platform file");
  if (executableChanges.length > 0 && behaviorChanges.length === 0) {
    blockers.push("terminal release embodiment is proof-only and has no behavior file");
  }
  if (candidate.executable_artifacts.length === 0) blockers.push("terminal release embodiment has no executable artifact evidence");
  if (candidate.routing_artifacts.length === 0) blockers.push("terminal release embodiment has no future-routing artifact evidence");
  if (candidate.proof_artifacts.length === 0) blockers.push("terminal release embodiment has no proof artifact evidence");

  return blockers;
}

function candidateBlockers(input: TerminalReleaseSingletonInput, candidate: TerminalReleaseCandidate): string[] {
  const blockers: string[] = [];

  if (!candidate.candidate_id.trim()) blockers.push("terminal release candidate has no id");
  if (candidate.branch !== input.active_branch) {
    blockers.push(`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`);
  }
  if (candidate.head_sha !== input.live_head_sha) {
    blockers.push(`candidate head ${candidate.head_sha} does not match live head ${input.live_head_sha}`);
  }
  if (input.prohibited_classes.includes(candidate.progress_class)) {
    blockers.push(`terminal release class is prohibited: ${candidate.progress_class}`);
  }

  if (blockers.length > 0) return blockers;

  if (candidate.progress_class === "external_platform_embodiment") {
    return externalEmbodimentBlockers(candidate);
  }

  if (candidate.progress_class === "fresh_status_readback") {
    const hasFreshReadbackAuthority =
      candidate.head_moved_since_last_readback === true || (candidate.new_current_head_check_ids ?? []).length > 0;
    if (!hasFreshReadbackAuthority) {
      blockers.push("fresh status readback lacks moved-head or new current-head check authority");
    }
    if (candidate.status_surface_attached !== true) {
      blockers.push("fresh status readback has no attached live-head status surface");
    }
    return blockers;
  }

  if (candidate.progress_class === "exact_external_blocker") {
    if (!candidate.blocker?.trim()) blockers.push("exact external blocker candidate has no blocker text");
    return blockers;
  }

  blockers.push(`terminal release class is not an admitted progress class: ${candidate.progress_class}`);
  return blockers;
}

function actionFor(candidate: TerminalReleaseCandidate): TerminalReleaseAction {
  if (candidate.progress_class === "external_platform_embodiment") return "emit_single_external_embodiment";
  if (candidate.progress_class === "fresh_status_readback") return "emit_single_fresh_status_readback";
  return "emit_single_exact_blocker";
}

function evidenceFor(candidate: TerminalReleaseCandidate): string[] {
  if (candidate.progress_class === "external_platform_embodiment") {
    return [
      candidate.candidate_id,
      ...candidate.changed_files.filter(executablePlatformPath),
      ...candidate.executable_artifacts,
      ...candidate.routing_artifacts,
      ...candidate.proof_artifacts,
    ];
  }

  if (candidate.progress_class === "fresh_status_readback") {
    return [
      candidate.candidate_id,
      ...(candidate.head_moved_since_last_readback ? ["head moved since last readback"] : []),
      ...(candidate.new_current_head_check_ids ?? []).map((id) => `new current-head check ${id}`),
      "attached live-head status surface",
    ];
  }

  return [candidate.candidate_id, candidate.blocker ?? "exact external blocker supplied"];
}

export function selectSingleTerminalRelease(
  input: TerminalReleaseSingletonInput,
): TerminalReleaseSingletonVerdict {
  const ready: TerminalReleaseCandidate[] = [];
  const rejected: TerminalReleaseRejection[] = [];

  for (const candidate of input.candidates) {
    const reasons = candidateBlockers(input, candidate);
    if (reasons.length > 0) {
      rejected.push({ candidate_id: candidate.candidate_id || "<missing>", reasons });
      continue;
    }
    ready.push(candidate);
  }

  if (ready.length === 0) {
    return {
      ok: false,
      action: "block_no_terminal_release",
      branch: input.active_branch,
      head_sha: input.live_head_sha,
      selected_candidate_id: null,
      decisive_evidence: [],
      rejected,
      blockers: ["no terminal release candidate survived singleton selection"],
      next_route: "supply exactly one valid embodiment, fresh status readback, or exact external blocker candidate",
    };
  }

  if (ready.length > 1) {
    return {
      ok: false,
      action: "block_ambiguous_terminal_release",
      branch: input.active_branch,
      head_sha: input.live_head_sha,
      selected_candidate_id: null,
      decisive_evidence: ready.flatMap(evidenceFor),
      rejected,
      blockers: ready.map((candidate) => `multiple terminal release candidates survived: ${candidate.candidate_id}`),
      next_route: "collapse the release to exactly one admitted progress class before touching the PR",
    };
  }

  const [selected] = ready;
  return {
    ok: true,
    action: actionFor(selected),
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    selected_candidate_id: selected.candidate_id,
    decisive_evidence: evidenceFor(selected),
    rejected,
    blockers: [],
    next_route: "execute only the selected terminal release class, then re-enter from the moved head or surfaced blocker",
  };
}
