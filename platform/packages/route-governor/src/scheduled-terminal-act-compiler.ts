export type ScheduledTerminalActClass =
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

export type ScheduledTerminalActAction =
  | "admit_single_external_embodiment"
  | "admit_single_fresh_status_readback"
  | "admit_single_exact_external_blocker"
  | "block_no_terminal_act"
  | "block_branch_mismatch"
  | "block_non_progress_class";

export interface ScheduledCheckRunEvidence {
  id: string;
  head_sha: string;
  name: string;
}

export interface ScheduledTerminalActCandidate {
  candidate_id: string;
  act_class: ScheduledTerminalActClass;
  branch: string;
  base_head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  new_check_runs: ScheduledCheckRunEvidence[];
  blocker?: string;
}

export interface ScheduledTerminalActInput {
  active_branch: string;
  live_head_sha: string;
  previous_status_head_sha: string;
  candidates: ScheduledTerminalActCandidate[];
}

export interface ScheduledTerminalActVerdict {
  ok: boolean;
  action: ScheduledTerminalActAction;
  branch: string;
  head_sha: string;
  selected_candidate_id: string | null;
  rejected_candidate_ids: string[];
  shadowed_terminal_candidate_ids: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

interface CandidateEvaluation {
  candidate: ScheduledTerminalActCandidate;
  action: ScheduledTerminalActAction;
  priority: number;
  decisive_evidence: string[];
  blockers: string[];
}

const NON_PROGRESS_CLASSES = new Set<ScheduledTerminalActClass>([
  "pr_metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "guessed_future_ci",
  "reclose_resolved_blocker",
]);

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function proofOnlyPath(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function behaviorPlatformPath(path: string): boolean {
  return executablePlatformPath(path) && !proofOnlyPath(path);
}

function currentHeadChecks(input: ScheduledTerminalActInput, candidate: ScheduledTerminalActCandidate): ScheduledCheckRunEvidence[] {
  return candidate.new_check_runs.filter((run) => run.head_sha === input.live_head_sha);
}

function evaluateCandidate(
  input: ScheduledTerminalActInput,
  candidate: ScheduledTerminalActCandidate,
): CandidateEvaluation {
  const blockers: string[] = [];

  if (!candidate.candidate_id.trim()) blockers.push("scheduled terminal candidate has no candidate id");
  if (candidate.branch !== input.active_branch) {
    blockers.push(`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`);
  }

  if (NON_PROGRESS_CLASSES.has(candidate.act_class)) {
    return {
      candidate,
      action: "block_non_progress_class",
      priority: 0,
      decisive_evidence: [candidate.act_class],
      blockers: [`scheduled terminal act class is non-progress: ${candidate.act_class}`],
    };
  }

  if (candidate.act_class === "external_platform_embodiment") {
    if (candidate.base_head_sha !== input.live_head_sha) {
      blockers.push(`embodiment base ${candidate.base_head_sha} is not live head ${input.live_head_sha}`);
    }
    if (!candidate.changed_files.some(behaviorPlatformPath)) {
      blockers.push("external embodiment must change a behavior-bearing platform file, not only proof files");
    }
    if (candidate.executable_artifacts.length === 0) blockers.push("external embodiment has no executable artifact evidence");
    if (candidate.routing_artifacts.length === 0) blockers.push("external embodiment has no future-routing artifact evidence");
    if (candidate.proof_artifacts.length === 0) blockers.push("external embodiment has no proof artifact evidence");

    return {
      candidate,
      action: "admit_single_external_embodiment",
      priority: 3,
      decisive_evidence: [
        `live head ${input.live_head_sha}`,
        ...candidate.changed_files.filter(executablePlatformPath),
        ...candidate.executable_artifacts,
        ...candidate.routing_artifacts,
        ...candidate.proof_artifacts,
      ],
      blockers,
    };
  }

  if (candidate.act_class === "fresh_status_readback") {
    const headMoved = input.live_head_sha !== input.previous_status_head_sha;
    const checks = currentHeadChecks(input, candidate);
    if (!headMoved && checks.length === 0) {
      blockers.push("fresh status readback requires a moved head or new live-head checks");
    }

    return {
      candidate,
      action: "admit_single_fresh_status_readback",
      priority: 2,
      decisive_evidence: [
        ...(headMoved ? [`head moved from ${input.previous_status_head_sha} to ${input.live_head_sha}`] : []),
        ...checks.map((run) => `new live-head check ${run.id}: ${run.name}`),
      ],
      blockers,
    };
  }

  const blocker = candidate.blocker?.trim();
  if (!blocker) blockers.push("exact external blocker candidate has no blocker text");

  return {
    candidate,
    action: "admit_single_exact_external_blocker",
    priority: 1,
    decisive_evidence: blocker ? [blocker, `live head ${input.live_head_sha}`] : [`live head ${input.live_head_sha}`],
    blockers,
  };
}

export function compileScheduledTerminalAct(input: ScheduledTerminalActInput): ScheduledTerminalActVerdict {
  const evaluations = input.candidates.map((candidate) => evaluateCandidate(input, candidate));
  const valid = evaluations.filter((evaluation) => evaluation.blockers.length === 0);
  const rejected = evaluations.filter((evaluation) => evaluation.blockers.length > 0);

  if (valid.length === 0) {
    const branchMismatch = rejected.find((evaluation) =>
      evaluation.blockers.some((blocker) => blocker.includes("does not match active branch")),
    );
    const nonProgressOnly = rejected.length > 0 && rejected.every((evaluation) => evaluation.action === "block_non_progress_class");

    return {
      ok: false,
      action: branchMismatch ? "block_branch_mismatch" : nonProgressOnly ? "block_non_progress_class" : "block_no_terminal_act",
      branch: input.active_branch,
      head_sha: input.live_head_sha,
      selected_candidate_id: null,
      rejected_candidate_ids: rejected.map((evaluation) => evaluation.candidate.candidate_id),
      shadowed_terminal_candidate_ids: [],
      decisive_evidence: rejected.flatMap((evaluation) => evaluation.decisive_evidence),
      blockers: rejected.flatMap((evaluation) => evaluation.blockers),
      next_route: "supply exactly one admissible external embodiment, fresh status readback, or exact external blocker candidate",
    };
  }

  valid.sort((left, right) => right.priority - left.priority || left.candidate.candidate_id.localeCompare(right.candidate.candidate_id));
  const selected = valid[0];
  const shadowed = valid.slice(1);

  return {
    ok: true,
    action: selected.action,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    selected_candidate_id: selected.candidate.candidate_id,
    rejected_candidate_ids: rejected.map((evaluation) => evaluation.candidate.candidate_id),
    shadowed_terminal_candidate_ids: shadowed.map((evaluation) => evaluation.candidate.candidate_id),
    decisive_evidence: selected.decisive_evidence,
    blockers: [],
    next_route:
      selected.action === "admit_single_external_embodiment"
        ? "commit only the selected embodiment; after the branch moves, read status only for that moved head"
        : selected.action === "admit_single_fresh_status_readback"
          ? "publish only the selected live-head readback; do not bundle embodiment or blocker claims into it"
          : "emit only the selected exact blocker; do not bundle status or embodiment claims into it",
  };
}
