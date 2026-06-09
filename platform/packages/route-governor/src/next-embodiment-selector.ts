export type EmbodimentCapabilityAxis =
  | "runtime_execution"
  | "source_routing"
  | "proof_surface"
  | "external_write"
  | "status_readback";

export type NextEmbodimentDecision =
  | "select_next_embodiment"
  | "block_no_selectable_embodiment";

export interface NextEmbodimentCandidate {
  candidate_id: string;
  branch: string;
  live_head_sha: string;
  move_class: string;
  artifact_class: string;
  capability_axis: EmbodimentCapabilityAxis;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  compounds_future_runs: boolean;
}

export interface NextEmbodimentSelectorInput {
  active_branch: string;
  live_head_sha: string;
  spent_move_classes: string[];
  spent_artifact_classes: string[];
  prohibited_move_classes: string[];
  candidates: NextEmbodimentCandidate[];
}

export interface RejectedNextEmbodimentCandidate {
  candidate_id: string;
  blockers: string[];
}

export interface SelectedNextEmbodimentCandidate {
  candidate_id: string;
  artifact_class: string;
  capability_axis: EmbodimentCapabilityAxis;
  decisive_evidence: string[];
}

export interface NextEmbodimentSelectorVerdict {
  ok: boolean;
  decision: NextEmbodimentDecision;
  branch: string;
  head_sha: string;
  selected: SelectedNextEmbodimentCandidate | null;
  rejected: RejectedNextEmbodimentCandidate[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_MOVE_CLASSES = new Set([
  "fresh_status_readback",
  "metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "guessed_future_ci",
  "reclose_completed_blocker",
  "old_repaired_head_blocker",
]);

const CAPABILITY_PRIORITY: Record<EmbodimentCapabilityAxis, number> = {
  runtime_execution: 5,
  external_write: 4,
  proof_surface: 3,
  source_routing: 2,
  status_readback: 1,
};

function executablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function candidateBlockers(input: NextEmbodimentSelectorInput, candidate: NextEmbodimentCandidate): string[] {
  const blockers: string[] = [];

  if (candidate.branch !== input.active_branch) {
    blockers.push(`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`);
  }
  if (candidate.live_head_sha !== input.live_head_sha) {
    blockers.push(`candidate head ${candidate.live_head_sha} does not match live head ${input.live_head_sha}`);
  }
  if (NON_PROGRESS_MOVE_CLASSES.has(candidate.move_class) || input.prohibited_move_classes.includes(candidate.move_class)) {
    blockers.push(`candidate repeats non-progress move class: ${candidate.move_class}`);
  }
  if (input.spent_move_classes.includes(candidate.move_class)) {
    blockers.push(`candidate move class is already spent: ${candidate.move_class}`);
  }
  if (!candidate.artifact_class.trim()) {
    blockers.push("candidate has no artifact class");
  }
  if (input.spent_artifact_classes.includes(candidate.artifact_class)) {
    blockers.push(`candidate artifact class is already spent: ${candidate.artifact_class}`);
  }
  if (!candidate.changed_files.some(executablePlatformPath)) {
    blockers.push("candidate does not change executable platform files");
  }
  if (candidate.executable_artifacts.length === 0) {
    blockers.push("candidate has no executable artifact evidence");
  }
  if (candidate.routing_artifacts.length === 0) {
    blockers.push("candidate has no future-routing artifact evidence");
  }
  if (candidate.proof_artifacts.length === 0) {
    blockers.push("candidate has no proof artifact evidence");
  }
  if (!candidate.compounds_future_runs) {
    blockers.push("candidate does not compound future runs");
  }

  return blockers;
}

function selectedEvidence(candidate: NextEmbodimentCandidate): string[] {
  return [
    candidate.move_class,
    candidate.artifact_class,
    candidate.capability_axis,
    ...candidate.changed_files.filter(executablePlatformPath),
    ...candidate.executable_artifacts,
    ...candidate.routing_artifacts,
    ...candidate.proof_artifacts,
  ];
}

export function selectNextEmbodimentIncrement(
  input: NextEmbodimentSelectorInput,
): NextEmbodimentSelectorVerdict {
  const rejected: RejectedNextEmbodimentCandidate[] = [];
  const selectable: NextEmbodimentCandidate[] = [];

  for (const candidate of input.candidates) {
    const blockers = candidateBlockers(input, candidate);
    if (blockers.length > 0) {
      rejected.push({ candidate_id: candidate.candidate_id, blockers });
      continue;
    }
    selectable.push(candidate);
  }

  selectable.sort((left, right) => {
    const priorityDelta = CAPABILITY_PRIORITY[right.capability_axis] - CAPABILITY_PRIORITY[left.capability_axis];
    if (priorityDelta !== 0) return priorityDelta;
    return right.decisive_weight - left.decisive_weight;
  });

  const selected = selectable[0];
  if (!selected) {
    return {
      ok: false,
      decision: "block_no_selectable_embodiment",
      branch: input.active_branch,
      head_sha: input.live_head_sha,
      selected: null,
      rejected,
      blockers: ["no non-repeated executable embodiment candidate survived selection"],
      next_route: "supply a new executable platform increment or emit one exact external blocker",
    };
  }

  return {
    ok: true,
    decision: "select_next_embodiment",
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    selected: {
      candidate_id: selected.candidate_id,
      artifact_class: selected.artifact_class,
      capability_axis: selected.capability_axis,
      decisive_evidence: selectedEvidence(selected),
    },
    rejected,
    blockers: [],
    next_route: "commit the selected embodiment increment, then bind status readback to the resulting new head",
  };
}

declare module "./next-embodiment-selector.js" {
  interface NextEmbodimentCandidate {
    decisive_weight: number;
  }
}
