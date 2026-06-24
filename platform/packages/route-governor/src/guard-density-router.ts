export type GuardDensityCandidateClass =
  | "capability_extension"
  | "guard_boundary"
  | "status_readback"
  | "failure_repair"
  | "exact_external_blocker";

export type GuardDensityAction =
  | "admit_capability_extension"
  | "admit_failure_bound_guard"
  | "admit_failure_repair"
  | "emit_exact_blocker"
  | "block_guard_accumulation"
  | "block_non_progress_readback"
  | "block_branch_mismatch"
  | "block_stale_base_head"
  | "block_incomplete_candidate";

export interface GuardDensityCandidate {
  candidate_id: string;
  candidate_class: GuardDensityCandidateClass;
  branch: string;
  base_head_sha: string;
  artifact_class: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  bound_failure_signature?: string;
  exact_blocker?: string;
}

export interface GuardDensityRouterInput {
  active_branch: string;
  live_head_sha: string;
  recent_artifact_classes: string[];
  max_guard_like_artifacts: number;
  live_failure_signatures: string[];
  candidate: GuardDensityCandidate;
}

export interface GuardDensityRouterVerdict {
  ok: boolean;
  action: GuardDensityAction;
  branch: string;
  head_sha: string;
  guard_like_count: number;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const GUARD_TERMS = [
  "admission",
  "boundary",
  "gate",
  "guard",
  "handoff",
  "ledger",
  "policy",
  "receipt",
  "reconciliation",
  "router",
];

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function isGuardLikeArtifact(artifactClass: string): boolean {
  const normalized = artifactClass.toLowerCase();
  return GUARD_TERMS.some((term) => normalized.includes(term));
}

function base(input: GuardDensityRouterInput): Pick<GuardDensityRouterVerdict, "branch" | "head_sha" | "guard_like_count"> {
  return {
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    guard_like_count: input.recent_artifact_classes.filter(isGuardLikeArtifact).length,
  };
}

function block(
  input: GuardDensityRouterInput,
  action: Exclude<
    GuardDensityAction,
    "admit_capability_extension" | "admit_failure_bound_guard" | "admit_failure_repair" | "emit_exact_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): GuardDensityRouterVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function candidateRequirements(candidate: GuardDensityCandidate): string[] {
  const blockers: string[] = [];

  if (!candidate.candidate_id.trim()) blockers.push("guard-density candidate has no candidate id");
  if (!candidate.artifact_class.trim()) blockers.push("guard-density candidate has no artifact class");

  if (candidate.candidate_class === "exact_external_blocker") {
    if (!candidate.exact_blocker?.trim()) blockers.push("exact blocker candidate has no blocker text");
    return blockers;
  }

  if (!candidate.changed_files.some(executablePlatformPath)) {
    blockers.push("guard-density candidate changes no executable platform file");
  }
  if (candidate.executable_artifacts.length === 0) {
    blockers.push("guard-density candidate has no executable artifact evidence");
  }
  if (candidate.routing_artifacts.length === 0) {
    blockers.push("guard-density candidate has no future-routing artifact evidence");
  }
  if (candidate.proof_artifacts.length === 0) {
    blockers.push("guard-density candidate has no proof artifact evidence");
  }

  return blockers;
}

function isFailureBound(input: GuardDensityRouterInput): boolean {
  const signature = input.candidate.bound_failure_signature?.trim();
  return Boolean(signature) && input.live_failure_signatures.includes(signature ?? "");
}

export function routeGuardDensity(input: GuardDensityRouterInput): GuardDensityRouterVerdict {
  const candidate = input.candidate;

  if (candidate.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`],
      "bind the candidate to the active PR branch before choosing another guard or capability increment",
    );
  }

  if (candidate.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_base_head",
      [`candidate base ${candidate.base_head_sha} is not live head ${input.live_head_sha}`],
      "rebase the candidate to the live PR head before moving the branch",
    );
  }

  const requirementBlockers = candidateRequirements(candidate);
  if (requirementBlockers.length > 0) {
    return block(
      input,
      "block_incomplete_candidate",
      requirementBlockers,
      "complete the executable, routing, and proof evidence before release",
    );
  }

  if (candidate.candidate_class === "exact_external_blocker") {
    return {
      ...base(input),
      ok: true,
      action: "emit_exact_blocker",
      decisive_evidence: [candidate.exact_blocker ?? "", `live head ${input.live_head_sha}`].filter(Boolean),
      blockers: candidate.exact_blocker ? [candidate.exact_blocker] : [],
      next_route: "resolve the exact blocker before adding another guard or capability increment",
    };
  }

  if (candidate.candidate_class === "status_readback") {
    return block(
      input,
      "block_non_progress_readback",
      ["guard-density routing does not count another status readback as an embodiment increment"],
      "perform a live status readback only through the status route, not as guard-density progress",
    );
  }

  if (candidate.candidate_class === "failure_repair") {
    if (!isFailureBound(input)) {
      return block(
        input,
        "block_incomplete_candidate",
        ["failure repair candidate is not bound to a live failure signature"],
        "bind repair to a concrete live-head failure signature before editing",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_failure_repair",
      decisive_evidence: [
        candidate.candidate_id,
        candidate.bound_failure_signature ?? "",
        ...candidate.changed_files.filter(executablePlatformPath),
        ...candidate.executable_artifacts,
        ...candidate.routing_artifacts,
        ...candidate.proof_artifacts,
      ],
      blockers: [],
      next_route: "commit only the live-failure-bound repair and require moved-head status readback",
    };
  }

  const guardPressureExceeded = base(input).guard_like_count >= input.max_guard_like_artifacts;
  const candidateIsGuardLike = candidate.candidate_class === "guard_boundary" || isGuardLikeArtifact(candidate.artifact_class);

  if (candidateIsGuardLike && guardPressureExceeded && !isFailureBound(input)) {
    return block(
      input,
      "block_guard_accumulation",
      [
        `recent guard-like artifact count ${base(input).guard_like_count} reached limit ${input.max_guard_like_artifacts}`,
        "guard candidate is not bound to a live failure signature",
      ],
      "choose a capability-extension artifact that changes runtime behavior, or bind the guard to a concrete live failure",
      [candidate.artifact_class, ...input.recent_artifact_classes],
    );
  }

  if (candidateIsGuardLike) {
    return {
      ...base(input),
      ok: true,
      action: "admit_failure_bound_guard",
      decisive_evidence: [
        candidate.candidate_id,
        candidate.bound_failure_signature ?? "guard pressure below limit",
        ...candidate.changed_files.filter(executablePlatformPath),
        ...candidate.executable_artifacts,
        ...candidate.routing_artifacts,
        ...candidate.proof_artifacts,
      ],
      blockers: [],
      next_route: "commit the failure-bound guard, then return to capability extension after the blocker is closed",
    };
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_capability_extension",
    decisive_evidence: [
      candidate.candidate_id,
      candidate.artifact_class,
      ...candidate.changed_files.filter(executablePlatformPath),
      ...candidate.executable_artifacts,
      ...candidate.routing_artifacts,
      ...candidate.proof_artifacts,
    ],
    blockers: [],
    next_route: "commit the capability extension, then bind the next status readback to the moved head",
  };
}
