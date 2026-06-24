import type { EmbodimentCapabilityAxis } from "./next-embodiment-selector.js";

export type CapabilityFrontierPlannerAction =
  | "select_frontier_axis"
  | "allow_exhausted_frontier_repeat"
  | "block_no_frontier_candidate"
  | "block_branch_mismatch"
  | "block_head_mismatch";

export interface CapabilityFrontierCandidate {
  candidate_id: string;
  branch: string;
  live_head_sha: string;
  capability_axis: EmbodimentCapabilityAxis;
  artifact_class: string;
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  decisive_weight: number;
}

export interface CapabilityFrontierPlannerInput {
  active_branch: string;
  live_head_sha: string;
  frontier_axes: EmbodimentCapabilityAxis[];
  spent_capability_axes: EmbodimentCapabilityAxis[];
  candidates: CapabilityFrontierCandidate[];
}

export interface CapabilityFrontierRejection {
  candidate_id: string;
  blockers: string[];
}

export interface CapabilityFrontierSelection {
  candidate_id: string;
  capability_axis: EmbodimentCapabilityAxis;
  artifact_class: string;
  decisive_evidence: string[];
}

export interface CapabilityFrontierPlannerVerdict {
  ok: boolean;
  action: CapabilityFrontierPlannerAction;
  branch: string;
  head_sha: string;
  selected: CapabilityFrontierSelection | null;
  rejected: CapabilityFrontierRejection[];
  blockers: string[];
  next_route: string;
}

function candidateBlockers(
  input: CapabilityFrontierPlannerInput,
  candidate: CapabilityFrontierCandidate,
): string[] {
  const blockers: string[] = [];

  if (candidate.branch !== input.active_branch) {
    blockers.push(`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`);
  }
  if (candidate.live_head_sha !== input.live_head_sha) {
    blockers.push(`candidate head ${candidate.live_head_sha} does not match live head ${input.live_head_sha}`);
  }
  if (!input.frontier_axes.includes(candidate.capability_axis)) {
    blockers.push(`candidate axis is outside the frontier: ${candidate.capability_axis}`);
  }
  if (!candidate.artifact_class.trim()) {
    blockers.push("candidate has no artifact class");
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

  return blockers;
}

function decisiveEvidence(candidate: CapabilityFrontierCandidate): string[] {
  return [
    candidate.capability_axis,
    candidate.artifact_class,
    ...candidate.executable_artifacts,
    ...candidate.routing_artifacts,
    ...candidate.proof_artifacts,
  ];
}

function selected(candidate: CapabilityFrontierCandidate): CapabilityFrontierSelection {
  return {
    candidate_id: candidate.candidate_id,
    capability_axis: candidate.capability_axis,
    artifact_class: candidate.artifact_class,
    decisive_evidence: decisiveEvidence(candidate),
  };
}

export function planCapabilityFrontier(
  input: CapabilityFrontierPlannerInput,
): CapabilityFrontierPlannerVerdict {
  const rejected: CapabilityFrontierRejection[] = [];
  const viable: CapabilityFrontierCandidate[] = [];

  for (const candidate of input.candidates) {
    const blockers = candidateBlockers(input, candidate);
    if (blockers.length > 0) {
      rejected.push({ candidate_id: candidate.candidate_id, blockers });
      continue;
    }
    viable.push(candidate);
  }

  if (viable.length === 0) {
    return {
      ok: false,
      action: "block_no_frontier_candidate",
      branch: input.active_branch,
      head_sha: input.live_head_sha,
      selected: null,
      rejected,
      blockers: ["no capability-frontier embodiment candidate survived"],
      next_route: "supply an executable embodiment candidate on a frontier capability axis",
    };
  }

  const unspent = viable.filter((candidate) => !input.spent_capability_axes.includes(candidate.capability_axis));
  const pool = unspent.length > 0 ? unspent : viable;
  pool.sort((left, right) => right.decisive_weight - left.decisive_weight);

  const winner = pool[0];
  const repeatingSpentAxis = input.spent_capability_axes.includes(winner.capability_axis);

  return {
    ok: true,
    action: repeatingSpentAxis ? "allow_exhausted_frontier_repeat" : "select_frontier_axis",
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    selected: selected(winner),
    rejected,
    blockers: [],
    next_route: repeatingSpentAxis
      ? "all viable frontier axes are already spent; commit only if the embodiment changes executable behavior"
      : "commit the unspent-axis embodiment, then record the capability axis as spent for the next scheduled run",
  };
}
