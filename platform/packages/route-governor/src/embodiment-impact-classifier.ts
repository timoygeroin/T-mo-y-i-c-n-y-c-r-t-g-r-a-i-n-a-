export type EmbodimentImpactMoveClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "proof_only_extension"
  | "metadata_reread";

export type EmbodimentImpactAction =
  | "accept_behavior_increment"
  | "block_non_embodiment_move"
  | "block_repeated_artifact_class"
  | "block_non_executable_change"
  | "block_proof_only_change"
  | "block_missing_behavior_surface";

export interface EmbodimentImpactCandidate {
  candidate_id: string;
  branch: string;
  active_branch: string;
  live_head_sha: string;
  requested_move_class: EmbodimentImpactMoveClass;
  artifact_class: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  behavior_surfaces: string[];
  spent_artifact_classes: string[];
}

export interface EmbodimentImpactVerdict {
  ok: boolean;
  action: EmbodimentImpactAction;
  candidate_id: string;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  failures: string[];
  next_route: string;
}

function isExecutablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function isProofOnlyPath(path: string): boolean {
  return /(?:\.test|\-proof)\.ts$/.test(path);
}

function nonEmpty(values: string[]): string[] {
  return values.filter((value) => value.trim().length > 0);
}

function base(candidate: EmbodimentImpactCandidate): Pick<EmbodimentImpactVerdict, "candidate_id" | "branch" | "head_sha"> {
  return {
    candidate_id: candidate.candidate_id,
    branch: candidate.branch,
    head_sha: candidate.live_head_sha,
  };
}

export function classifyEmbodimentImpact(candidate: EmbodimentImpactCandidate): EmbodimentImpactVerdict {
  const executableChanges = candidate.changed_files.filter(isExecutablePlatformPath);
  const nonProofExecutableChanges = executableChanges.filter((path) => !isProofOnlyPath(path));
  const failures: string[] = [];

  if (candidate.branch !== candidate.active_branch) {
    failures.push(`candidate branch ${candidate.branch} does not match active branch ${candidate.active_branch}`);
  }

  if (candidate.requested_move_class !== "external_platform_embodiment") {
    failures.push(`move class is not an external platform embodiment: ${candidate.requested_move_class}`);
  }

  if (candidate.spent_artifact_classes.includes(candidate.artifact_class)) {
    failures.push(`artifact class already spent: ${candidate.artifact_class}`);
  }

  if (executableChanges.length === 0) {
    failures.push("embodiment impact requires an executable platform package change");
  }

  if (executableChanges.length > 0 && nonProofExecutableChanges.length === 0) {
    failures.push("embodiment impact cannot be proof-only or test-only");
  }

  if (nonEmpty(candidate.executable_artifacts).length === 0) {
    failures.push("embodiment impact requires a named executable artifact");
  }

  if (nonEmpty(candidate.routing_artifacts).length === 0) {
    failures.push("embodiment impact requires a named future-routing artifact");
  }

  if (nonEmpty(candidate.behavior_surfaces).length === 0) {
    failures.push("embodiment impact requires a behavior surface that changes future routing decisions");
  }

  if (failures.length > 0) {
    let action: Exclude<EmbodimentImpactAction, "accept_behavior_increment"> = "block_missing_behavior_surface";
    if (failures.some((failure) => failure.includes("move class"))) action = "block_non_embodiment_move";
    else if (failures.some((failure) => failure.includes("already spent"))) action = "block_repeated_artifact_class";
    else if (failures.some((failure) => failure.includes("executable platform"))) action = "block_non_executable_change";
    else if (failures.some((failure) => failure.includes("proof-only"))) action = "block_proof_only_change";

    return {
      ...base(candidate),
      ok: false,
      action,
      decisive_evidence: [],
      failures,
      next_route: "choose a non-repeated executable behavior surface or emit one exact external blocker",
    };
  }

  return {
    ...base(candidate),
    ok: true,
    action: "accept_behavior_increment",
    decisive_evidence: [
      ...nonProofExecutableChanges,
      ...nonEmpty(candidate.executable_artifacts),
      ...nonEmpty(candidate.routing_artifacts),
      ...nonEmpty(candidate.behavior_surfaces),
      ...nonEmpty(candidate.proof_artifacts),
    ],
    failures: [],
    next_route: "commit the behavior-bearing embodiment increment, then bind status claims to the new live head",
  };
}
