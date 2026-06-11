export type CapabilityAxis = "status_readback" | "source_routing" | "proof_surface" | "external_write" | "runtime_execution";

export type CapabilityEscalationAction =
  | "admit_escalated_embodiment"
  | "block_branch_or_head_mismatch"
  | "block_non_embodiment_move"
  | "block_axis_regression"
  | "block_spent_class"
  | "block_incomplete_candidate";

export interface CapabilityEscalationCandidate {
  candidate_id: string;
  branch: string;
  base_head_sha: string;
  move_class: string;
  artifact_class: string;
  capability_axis: CapabilityAxis;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  compounds_axes: CapabilityAxis[];
}

export interface CapabilityEscalationPolicyInput {
  active_branch: string;
  live_head_sha: string;
  current_axis_floor: CapabilityAxis;
  spent_move_classes: string[];
  spent_artifact_classes: string[];
  candidate: CapabilityEscalationCandidate;
}

export interface CapabilityEscalationPolicyVerdict {
  ok: boolean;
  action: CapabilityEscalationAction;
  branch: string;
  head_sha: string;
  admitted_candidate_id: string | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const AXIS_RANK: Record<CapabilityAxis, number> = {
  status_readback: 1,
  source_routing: 2,
  proof_surface: 3,
  external_write: 4,
  runtime_execution: 5,
};

function executablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function base(input: CapabilityEscalationPolicyInput): Pick<CapabilityEscalationPolicyVerdict, "branch" | "head_sha"> {
  return { branch: input.active_branch, head_sha: input.live_head_sha };
}

function block(
  input: CapabilityEscalationPolicyInput,
  action: Exclude<CapabilityEscalationAction, "admit_escalated_embodiment">,
  blockers: string[],
  nextRoute: string,
): CapabilityEscalationPolicyVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    admitted_candidate_id: null,
    decisive_evidence: [],
    blockers,
    next_route: nextRoute,
  };
}

function completionBlockers(candidate: CapabilityEscalationCandidate): string[] {
  const blockers: string[] = [];

  if (!candidate.candidate_id.trim()) blockers.push("candidate has no id");
  if (!candidate.artifact_class.trim()) blockers.push("candidate has no artifact class");
  if (!candidate.changed_files.some(executablePlatformPath)) {
    blockers.push("candidate changes no executable platform file");
  }
  if (candidate.executable_artifacts.length === 0) blockers.push("candidate has no executable artifact evidence");
  if (candidate.routing_artifacts.length === 0) blockers.push("candidate has no future-routing artifact evidence");
  if (candidate.proof_artifacts.length === 0) blockers.push("candidate has no proof artifact evidence");
  if (!candidate.compounds_axes.includes(candidate.capability_axis)) {
    blockers.push(`candidate compounds axes do not include its primary axis: ${candidate.capability_axis}`);
  }
  if (candidate.compounds_axes.length < 2) {
    blockers.push("candidate does not compound into a second capability axis");
  }

  return blockers;
}

export function applyCapabilityEscalationPolicy(
  input: CapabilityEscalationPolicyInput,
): CapabilityEscalationPolicyVerdict {
  const candidate = input.candidate;

  if (candidate.branch !== input.active_branch || candidate.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_branch_or_head_mismatch",
      [
        ...(candidate.branch !== input.active_branch
          ? [`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`]
          : []),
        ...(candidate.base_head_sha !== input.live_head_sha
          ? [`candidate base ${candidate.base_head_sha} does not match live head ${input.live_head_sha}`]
          : []),
      ],
      "rebase the capability escalation candidate to the active PR branch and live head",
    );
  }

  if (candidate.move_class !== "external_platform_embodiment") {
    return block(
      input,
      "block_non_embodiment_move",
      [`capability escalation only admits external embodiment, got ${candidate.move_class}`],
      "choose executable external embodiment before applying capability escalation",
    );
  }

  if (input.spent_move_classes.includes(candidate.move_class) || input.spent_artifact_classes.includes(candidate.artifact_class)) {
    return block(
      input,
      "block_spent_class",
      [
        ...(input.spent_move_classes.includes(candidate.move_class)
          ? [`move class is already spent: ${candidate.move_class}`]
          : []),
        ...(input.spent_artifact_classes.includes(candidate.artifact_class)
          ? [`artifact class is already spent: ${candidate.artifact_class}`]
          : []),
      ],
      "select an unspent embodiment class before moving the branch head",
    );
  }

  const candidateRank = AXIS_RANK[candidate.capability_axis];
  const floorRank = AXIS_RANK[input.current_axis_floor];
  if (candidateRank < floorRank || (candidateRank === floorRank && candidate.capability_axis !== "runtime_execution")) {
    return block(
      input,
      "block_axis_regression",
      [`candidate axis ${candidate.capability_axis} does not rise above floor ${input.current_axis_floor}`],
      "choose an embodiment candidate that raises the platform capability axis",
    );
  }

  const blockers = completionBlockers(candidate);
  if (blockers.length > 0) {
    return block(
      input,
      "block_incomplete_candidate",
      blockers,
      "complete executable, routing, proof, and compounding evidence before admission",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_escalated_embodiment",
    admitted_candidate_id: candidate.candidate_id,
    decisive_evidence: [
      candidate.candidate_id,
      `axis ${input.current_axis_floor} -> ${candidate.capability_axis}`,
      candidate.artifact_class,
      ...candidate.changed_files.filter(executablePlatformPath),
      ...candidate.executable_artifacts,
      ...candidate.routing_artifacts,
      ...candidate.proof_artifacts,
      ...candidate.compounds_axes.map((axis) => `compounds ${axis}`),
    ],
    blockers: [],
    next_route: "commit the admitted capability escalation, then require moved-head status before another escalation claim",
  };
}
