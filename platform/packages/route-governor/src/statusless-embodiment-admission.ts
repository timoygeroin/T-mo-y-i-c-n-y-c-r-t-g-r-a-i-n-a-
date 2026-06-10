export type StatuslessEmbodimentStatusState = "absent" | "passing" | "passing_with_warnings" | "pending" | "failing";

export type StatuslessEmbodimentAdmissionAction =
  | "admit_statusless_embodiment"
  | "continue_after_status"
  | "require_live_status_readback"
  | "block_live_failure"
  | "block_pending_status"
  | "block_incomplete_candidate"
  | "block_branch_mismatch";

export interface StatuslessEmbodimentCandidate {
  candidate_id: string;
  artifact_class: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
}

export interface StatuslessEmbodimentAdmissionInput {
  branch: string;
  active_branch: string;
  prompt_head_sha: string;
  live_head_sha: string;
  status_head_sha?: string;
  status_state: StatuslessEmbodimentStatusState;
  writable_external_surface: boolean;
  known_live_failures: string[];
  pending_surfaces: string[];
  spent_artifact_classes: string[];
  prohibited_move_classes: string[];
  requested_move_class: string;
  candidate?: StatuslessEmbodimentCandidate;
}

export interface StatuslessEmbodimentAdmissionVerdict {
  ok: boolean;
  action: StatuslessEmbodimentAdmissionAction;
  branch: string;
  head_sha: string;
  status_claim: "none" | "bound_to_live_head";
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function executablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function candidateBlockers(input: StatuslessEmbodimentAdmissionInput): string[] {
  const candidate = input.candidate;
  if (!candidate) return ["statusless embodiment admission has no embodiment candidate"];

  const blockers: string[] = [];

  if (!candidate.candidate_id.trim()) blockers.push("statusless embodiment candidate has no candidate id");
  if (!candidate.artifact_class.trim()) blockers.push("statusless embodiment candidate has no artifact class");
  if (input.spent_artifact_classes.includes(candidate.artifact_class)) {
    blockers.push(`statusless embodiment repeats spent artifact class: ${candidate.artifact_class}`);
  }
  if (!candidate.changed_files.some(executablePlatformPath)) {
    blockers.push("statusless embodiment candidate does not change executable platform files");
  }
  if (candidate.executable_artifacts.length === 0) {
    blockers.push("statusless embodiment candidate has no executable artifact evidence");
  }
  if (candidate.routing_artifacts.length === 0) {
    blockers.push("statusless embodiment candidate has no future-routing artifact evidence");
  }
  if (candidate.proof_artifacts.length === 0) {
    blockers.push("statusless embodiment candidate has no proof artifact evidence");
  }

  return blockers;
}

function candidateEvidence(candidate: StatuslessEmbodimentCandidate): string[] {
  return [
    candidate.candidate_id,
    candidate.artifact_class,
    ...candidate.changed_files.filter(executablePlatformPath),
    ...candidate.executable_artifacts,
    ...candidate.routing_artifacts,
    ...candidate.proof_artifacts,
  ];
}

function block(
  input: StatuslessEmbodimentAdmissionInput,
  action: Exclude<StatuslessEmbodimentAdmissionAction, "admit_statusless_embodiment" | "continue_after_status">,
  blockers: string[],
  nextRoute: string,
  decisiveEvidence: string[] = [],
): StatuslessEmbodimentAdmissionVerdict {
  return {
    ok: false,
    action,
    branch: input.branch,
    head_sha: input.live_head_sha,
    status_claim: "none",
    decisive_evidence: decisiveEvidence,
    blockers,
    next_route: nextRoute,
  };
}

export function admitStatuslessEmbodiment(
  input: StatuslessEmbodimentAdmissionInput,
): StatuslessEmbodimentAdmissionVerdict {
  if (input.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`statusless embodiment branch ${input.branch} does not match active branch ${input.active_branch}`],
      "rebind statusless embodiment admission to the active PR branch before release",
    );
  }

  if (input.prohibited_move_classes.includes(input.requested_move_class)) {
    return block(
      input,
      "block_incomplete_candidate",
      [`statusless embodiment requested prohibited move class: ${input.requested_move_class}`],
      "choose a non-repeated executable embodiment move class before branch write",
    );
  }

  if (input.status_head_sha && input.status_head_sha !== input.live_head_sha) {
    return block(
      input,
      "require_live_status_readback",
      [`attached status belongs to ${input.status_head_sha}, not live head ${input.live_head_sha}`],
      "discard stale status before choosing status readback, repair, or statusless embodiment",
      [`prompt head ${input.prompt_head_sha}`, `live head ${input.live_head_sha}`],
    );
  }

  if (input.status_state === "failing" || input.known_live_failures.length > 0) {
    return block(
      input,
      "block_live_failure",
      input.known_live_failures.length > 0 ? input.known_live_failures : [`live head ${input.live_head_sha} is failing`],
      "repair the concrete live-head failure before any statusless embodiment",
    );
  }

  if (input.status_state === "pending") {
    return block(
      input,
      "block_pending_status",
      input.pending_surfaces.length > 0 ? input.pending_surfaces : [`live head ${input.live_head_sha} has pending checks`],
      "wait for pending live-head checks before a no-status-claim branch write",
    );
  }

  const candidateFailures = candidateBlockers(input);
  if (candidateFailures.length > 0) {
    return block(
      input,
      "block_incomplete_candidate",
      candidateFailures,
      "supply a non-repeated executable embodiment candidate before statusless admission",
    );
  }

  const candidate = input.candidate;
  if (!candidate) {
    return block(
      input,
      "block_incomplete_candidate",
      ["statusless embodiment admission has no embodiment candidate"],
      "supply a non-repeated executable embodiment candidate before statusless admission",
    );
  }

  if (input.status_state === "passing" || input.status_state === "passing_with_warnings") {
    return {
      ok: true,
      action: "continue_after_status",
      branch: input.branch,
      head_sha: input.live_head_sha,
      status_claim: "bound_to_live_head",
      decisive_evidence: [
        `status ${input.status_state} is bound to live head ${input.live_head_sha}`,
        ...candidateEvidence(candidate),
      ],
      blockers: [],
      next_route: "commit the non-repeated executable embodiment, then require status for the moved head",
    };
  }

  if (input.prompt_head_sha === input.live_head_sha) {
    return block(
      input,
      "require_live_status_readback",
      [`prompt head is still live at ${input.live_head_sha}; no head movement justifies statusless admission`],
      "read live-head status or choose a different executable embodiment trigger",
    );
  }

  if (!input.writable_external_surface) {
    return block(
      input,
      "require_live_status_readback",
      ["no writable external surface is available for statusless embodiment"],
      "obtain live-head status through the available readback surface before release",
      [`live head ${input.live_head_sha} supersedes prompt head ${input.prompt_head_sha}`],
    );
  }

  return {
    ok: true,
    action: "admit_statusless_embodiment",
    branch: input.branch,
    head_sha: input.live_head_sha,
    status_claim: "none",
    decisive_evidence: [
      `live head ${input.live_head_sha} supersedes prompt head ${input.prompt_head_sha}`,
      "no live-head pass/fail status is claimed",
      "writable external surface is available",
      ...candidateEvidence(candidate),
    ],
    blockers: [],
    next_route: "commit the no-status-claim executable embodiment, then bind status readback to the new moved head",
  };
}
