export type TerminalReleaseClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "pr_metadata_reread"
  | "duplicate_ci_summary"
  | "duplicate_comment"
  | "local_memory_guard"
  | "guessed_future_ci"
  | "reclose_resolved_blocker";

export type SingleReleaseTerminalAction =
  | "admit_single_external_embodiment"
  | "admit_single_status_readback"
  | "admit_single_exact_blocker"
  | "block_no_terminal_release"
  | "block_multiple_terminal_releases"
  | "block_forbidden_release"
  | "block_incomplete_terminal_release";

export interface TerminalReleaseCandidate {
  release_id: string;
  release_class: TerminalReleaseClass;
  branch: string;
  base_head_sha: string;
  resulting_head_sha?: string;
  status_head_sha?: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  status_surfaces: string[];
  blocker_text?: string;
}

export interface SingleReleaseTerminalGateInput {
  active_branch: string;
  live_head_sha: string;
  prior_status_head_sha: string;
  prohibited_release_classes: TerminalReleaseClass[];
  candidates: TerminalReleaseCandidate[];
}

export interface SingleReleaseTerminalGateVerdict {
  ok: boolean;
  action: SingleReleaseTerminalAction;
  branch: string;
  head_sha: string;
  admitted_release_id: string | null;
  admitted_release_class: TerminalReleaseClass | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const TERMINAL_RELEASE_CLASSES = new Set<TerminalReleaseClass>([
  "external_platform_embodiment",
  "fresh_status_readback",
  "exact_external_blocker",
]);

function executablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function base(input: SingleReleaseTerminalGateInput): Pick<
  SingleReleaseTerminalGateVerdict,
  "branch" | "head_sha"
> {
  return { branch: input.active_branch, head_sha: input.live_head_sha };
}

function block(
  input: SingleReleaseTerminalGateInput,
  action: Exclude<
    SingleReleaseTerminalAction,
    "admit_single_external_embodiment" | "admit_single_status_readback" | "admit_single_exact_blocker"
  >,
  blockers: string[],
  nextRoute: string,
): SingleReleaseTerminalGateVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    admitted_release_id: null,
    admitted_release_class: null,
    decisive_evidence: [],
    blockers,
    next_route: nextRoute,
  };
}

function candidateCompletionBlockers(
  input: SingleReleaseTerminalGateInput,
  candidate: TerminalReleaseCandidate,
): string[] {
  const blockers: string[] = [];

  if (!candidate.release_id.trim()) blockers.push("terminal release candidate has no id");
  if (candidate.branch !== input.active_branch) {
    blockers.push(`terminal release candidate ${candidate.release_id} targets ${candidate.branch}, not ${input.active_branch}`);
  }
  if (candidate.base_head_sha !== input.live_head_sha) {
    blockers.push(
      `terminal release candidate ${candidate.release_id} is based on ${candidate.base_head_sha}, not live head ${input.live_head_sha}`,
    );
  }

  if (candidate.release_class === "external_platform_embodiment") {
    if (!candidate.changed_files.some(executablePlatformPath)) {
      blockers.push(`terminal release candidate ${candidate.release_id} changes no executable platform file`);
    }
    if (candidate.executable_artifacts.length === 0) {
      blockers.push(`terminal release candidate ${candidate.release_id} has no executable artifact evidence`);
    }
    if (candidate.routing_artifacts.length === 0) {
      blockers.push(`terminal release candidate ${candidate.release_id} has no future-routing artifact evidence`);
    }
    if (candidate.resulting_head_sha && candidate.resulting_head_sha === input.live_head_sha) {
      blockers.push(`terminal release candidate ${candidate.release_id} does not move the live head`);
    }
  }

  if (candidate.release_class === "fresh_status_readback") {
    if (candidate.status_head_sha !== input.live_head_sha) {
      blockers.push(
        `terminal status candidate ${candidate.release_id} is bound to ${candidate.status_head_sha ?? "<missing>"}, not live head ${input.live_head_sha}`,
      );
    }
    if (input.prior_status_head_sha === input.live_head_sha) {
      blockers.push(`terminal status candidate ${candidate.release_id} repeats status for ${input.live_head_sha}`);
    }
    if (candidate.status_surfaces.length === 0) {
      blockers.push(`terminal status candidate ${candidate.release_id} has no status surface evidence`);
    }
  }

  if (candidate.release_class === "exact_external_blocker" && !candidate.blocker_text?.trim()) {
    blockers.push(`terminal blocker candidate ${candidate.release_id} has no exact blocker text`);
  }

  return blockers;
}

function decisiveEvidence(candidate: TerminalReleaseCandidate): string[] {
  if (candidate.release_class === "external_platform_embodiment") {
    return [
      candidate.release_id,
      ...candidate.changed_files.filter(executablePlatformPath),
      ...candidate.executable_artifacts,
      ...candidate.routing_artifacts,
    ];
  }

  if (candidate.release_class === "fresh_status_readback") {
    return [candidate.release_id, ...(candidate.status_head_sha ? [`status head ${candidate.status_head_sha}`] : []), ...candidate.status_surfaces];
  }

  return [candidate.release_id, candidate.blocker_text ?? "exact external blocker"];
}

export function enforceSingleReleaseTerminalGate(
  input: SingleReleaseTerminalGateInput,
): SingleReleaseTerminalGateVerdict {
  const terminalCandidates = input.candidates.filter((candidate) => TERMINAL_RELEASE_CLASSES.has(candidate.release_class));

  if (terminalCandidates.length === 0) {
    return block(
      input,
      "block_no_terminal_release",
      ["no terminal release candidate was supplied"],
      "choose exactly one terminal release: external embodiment, fresh live-head status readback, or exact external blocker",
    );
  }

  const forbidden = terminalCandidates.filter((candidate) =>
    input.prohibited_release_classes.includes(candidate.release_class),
  );
  if (forbidden.length > 0) {
    return block(
      input,
      "block_forbidden_release",
      forbidden.map((candidate) => `terminal release class is prohibited: ${candidate.release_class}`),
      "drop prohibited release classes before selecting the one terminal output",
    );
  }

  if (terminalCandidates.length > 1) {
    return block(
      input,
      "block_multiple_terminal_releases",
      terminalCandidates.map((candidate) => `${candidate.release_id}:${candidate.release_class}`),
      "release exactly one terminal progress class; do not bundle readback, embodiment, blocker, comments, or metadata as one progress claim",
    );
  }

  const [candidate] = terminalCandidates;
  const blockers = candidateCompletionBlockers(input, candidate);
  if (blockers.length > 0) {
    return block(
      input,
      "block_incomplete_terminal_release",
      blockers,
      "complete the chosen terminal release candidate or replace it with one exact blocker",
    );
  }

  const action: SingleReleaseTerminalAction =
    candidate.release_class === "external_platform_embodiment"
      ? "admit_single_external_embodiment"
      : candidate.release_class === "fresh_status_readback"
        ? "admit_single_status_readback"
        : "admit_single_exact_blocker";

  return {
    ...base(input),
    ok: true,
    action,
    admitted_release_id: candidate.release_id,
    admitted_release_class: candidate.release_class,
    decisive_evidence: decisiveEvidence(candidate),
    blockers: [],
    next_route:
      candidate.release_class === "external_platform_embodiment"
        ? "commit only this embodiment, then require status readback for the moved head"
        : candidate.release_class === "fresh_status_readback"
          ? "publish only this live-head status readback, then choose the next non-repeated embodiment"
          : "emit only this exact blocker and stop until the blocker changes",
  };
}
