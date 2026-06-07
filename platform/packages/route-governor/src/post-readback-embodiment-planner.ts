export type EmbodimentPlannerStatus = "passing" | "passing_with_warnings" | "pending" | "failing" | "no_status_surface";

export type EmbodimentPlannerMoveClass =
  | "executable_route_behavior"
  | "fresh_status_readback"
  | "metadata_reread"
  | "duplicate_ci_summary"
  | "duplicate_comment"
  | "duplicate_label"
  | "local_memory_guard"
  | "guessed_future_ci"
  | "reclose_completed_blocker"
  | "duplicate_status_readback";

export interface EmbodimentPlannerCandidate {
  candidate_id: string;
  move_class: EmbodimentPlannerMoveClass;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_command: string;
}

export interface EmbodimentPlannerInput {
  branch: string;
  active_branch: string;
  current_head_sha: string;
  readback_head_sha: string;
  status_verdict: EmbodimentPlannerStatus;
  candidates: EmbodimentPlannerCandidate[];
}

export interface EmbodimentPlannerRejectedCandidate {
  candidate_id: string;
  reasons: string[];
}

export interface EmbodimentPlannerSelectedCandidate {
  candidate_id: string;
  release_instruction: "commit_external_embodiment";
  changed_files: string[];
  decisive_evidence: string[];
  proof_command: string;
}

export interface EmbodimentPlannerVerdict {
  ok: boolean;
  branch: string;
  head_sha: string;
  selected: EmbodimentPlannerSelectedCandidate | null;
  rejected: EmbodimentPlannerRejectedCandidate[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_CLASSES = new Set<EmbodimentPlannerMoveClass>([
  "fresh_status_readback",
  "metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "guessed_future_ci",
  "reclose_completed_blocker",
  "duplicate_status_readback",
]);

function statusAllowsEmbodiment(status: EmbodimentPlannerStatus): boolean {
  return status === "passing" || status === "passing_with_warnings";
}

function isExecutablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function evaluateCandidate(candidate: EmbodimentPlannerCandidate): string[] {
  const failures: string[] = [];

  if (NON_PROGRESS_CLASSES.has(candidate.move_class)) {
    failures.push(`candidate repeats non-progress move class: ${candidate.move_class}`);
  }

  if (!candidate.changed_files.some(isExecutablePlatformPath)) {
    failures.push("candidate does not change an executable platform path");
  }

  if (candidate.executable_artifacts.length === 0) {
    failures.push("candidate has no executable artifact");
  }

  if (candidate.routing_artifacts.length === 0) {
    failures.push("candidate has no future-routing artifact");
  }

  if (!candidate.proof_command.trim()) {
    failures.push("candidate has no proof command");
  }

  return failures;
}

function candidateScore(candidate: EmbodimentPlannerCandidate): number {
  return candidate.changed_files.length + candidate.executable_artifacts.length * 2 + candidate.routing_artifacts.length * 2;
}

export function planPostReadbackEmbodiment(input: EmbodimentPlannerInput): EmbodimentPlannerVerdict {
  const blockers: string[] = [];

  if (input.branch !== input.active_branch) {
    blockers.push(`embodiment planner branch ${input.branch} does not match active branch ${input.active_branch}`);
  }

  if (input.readback_head_sha !== input.current_head_sha) {
    blockers.push(`readback head ${input.readback_head_sha} is not current PR head ${input.current_head_sha}`);
  }

  if (!statusAllowsEmbodiment(input.status_verdict)) {
    blockers.push(`post-readback status is not passing: ${input.status_verdict}`);
  }

  if (blockers.length > 0) {
    return {
      ok: false,
      branch: input.branch,
      head_sha: input.current_head_sha,
      selected: null,
      rejected: [],
      blockers,
      next_route: "obtain a passing current-head readback before planning the next embodiment increment",
    };
  }

  const rejected: EmbodimentPlannerRejectedCandidate[] = [];
  const selectable = input.candidates.filter((candidate) => {
    const reasons = evaluateCandidate(candidate);
    if (reasons.length > 0) {
      rejected.push({ candidate_id: candidate.candidate_id, reasons });
      return false;
    }
    return true;
  });

  selectable.sort((left, right) => candidateScore(right) - candidateScore(left));
  const selected = selectable[0];

  if (!selected) {
    return {
      ok: false,
      branch: input.branch,
      head_sha: input.current_head_sha,
      selected: null,
      rejected,
      blockers: ["no executable embodiment candidate survived planning"],
      next_route: "supply an executable behavior change with future-routing evidence",
    };
  }

  return {
    ok: true,
    branch: input.branch,
    head_sha: input.current_head_sha,
    selected: {
      candidate_id: selected.candidate_id,
      release_instruction: "commit_external_embodiment",
      changed_files: selected.changed_files,
      decisive_evidence: [
        `current-head readback ${input.current_head_sha}: ${input.status_verdict}`,
        ...selected.executable_artifacts,
        ...selected.routing_artifacts,
      ],
      proof_command: selected.proof_command,
    },
    rejected,
    blockers: [],
    next_route: "commit the selected executable embodiment, then read only status surfaces bound to the moved head",
  };
}
