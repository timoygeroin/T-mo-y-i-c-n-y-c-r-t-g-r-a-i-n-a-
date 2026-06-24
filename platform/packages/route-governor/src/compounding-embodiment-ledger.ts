export type CompoundingCapabilityAxis =
  | "runtime_execution"
  | "external_write"
  | "proof_surface"
  | "source_routing"
  | "status_readback"
  | "blocker_retirement";

export type CompoundingLedgerAction =
  | "record_compounding_increment"
  | "block_repeated_increment"
  | "block_incomplete_increment"
  | "block_non_executable_increment";

export interface PriorEmbodimentIncrement {
  increment_id: string;
  artifact_class: string;
  capability_axes: CompoundingCapabilityAxis[];
  routing_effects: string[];
}

export interface CompoundingEmbodimentCandidate {
  increment_id: string;
  branch: string;
  active_branch: string;
  live_head_sha: string;
  artifact_class: string;
  capability_axes: CompoundingCapabilityAxis[];
  changed_files: string[];
  executable_artifacts: string[];
  routing_effects: string[];
  proof_artifacts: string[];
}

export interface CompoundingEmbodimentLedgerInput {
  branch: string;
  active_branch: string;
  live_head_sha: string;
  prior_increments: PriorEmbodimentIncrement[];
  candidate: CompoundingEmbodimentCandidate;
}

export interface CompoundingEmbodimentLedgerVerdict {
  ok: boolean;
  action: CompoundingLedgerAction;
  branch: string;
  head_sha: string;
  ledger_entry: PriorEmbodimentIncrement | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function nonProofExecutablePath(path: string): boolean {
  return executablePlatformPath(path) && !/(?:\.test|-proof)\.ts$/.test(path);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function textPresent(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

function candidateEvidence(candidate: CompoundingEmbodimentCandidate, newAxes: CompoundingCapabilityAxis[]): string[] {
  return [
    candidate.increment_id,
    candidate.artifact_class,
    ...newAxes.map((axis) => `new capability axis: ${axis}`),
    ...candidate.changed_files.filter(nonProofExecutablePath),
    ...textPresent(candidate.executable_artifacts),
    ...textPresent(candidate.routing_effects),
    ...textPresent(candidate.proof_artifacts),
  ];
}

export function compileCompoundingEmbodimentLedger(
  input: CompoundingEmbodimentLedgerInput,
): CompoundingEmbodimentLedgerVerdict {
  const candidate = input.candidate;
  const blockers: string[] = [];
  const spentIds = new Set(input.prior_increments.map((increment) => increment.increment_id));
  const spentArtifactClasses = new Set(input.prior_increments.map((increment) => increment.artifact_class));
  const spentAxes = new Set(input.prior_increments.flatMap((increment) => increment.capability_axes));
  const candidateAxes = unique(candidate.capability_axes);
  const newAxes = candidateAxes.filter((axis) => !spentAxes.has(axis));

  if (input.branch !== input.active_branch) {
    blockers.push(`ledger branch ${input.branch} does not match active branch ${input.active_branch}`);
  }
  if (candidate.branch !== input.active_branch) {
    blockers.push(`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`);
  }
  if (candidate.live_head_sha !== input.live_head_sha) {
    blockers.push(`candidate head ${candidate.live_head_sha} does not match live head ${input.live_head_sha}`);
  }
  if (!candidate.increment_id.trim()) blockers.push("candidate has no increment id");
  if (spentIds.has(candidate.increment_id)) blockers.push(`increment id already recorded: ${candidate.increment_id}`);
  if (!candidate.artifact_class.trim()) blockers.push("candidate has no artifact class");
  if (spentArtifactClasses.has(candidate.artifact_class)) {
    blockers.push(`artifact class already recorded: ${candidate.artifact_class}`);
  }
  if (candidateAxes.length === 0) blockers.push("candidate has no capability axis");
  if (candidateAxes.length > 0 && newAxes.length === 0) {
    blockers.push("candidate does not advance an unspent capability axis");
  }
  if (!candidate.changed_files.some(nonProofExecutablePath)) {
    blockers.push("candidate does not change a non-proof executable platform file");
  }
  if (textPresent(candidate.executable_artifacts).length === 0) {
    blockers.push("candidate has no executable artifact evidence");
  }
  if (textPresent(candidate.routing_effects).length === 0) {
    blockers.push("candidate has no future-routing effect");
  }
  if (textPresent(candidate.proof_artifacts).length === 0) {
    blockers.push("candidate has no proof artifact evidence");
  }

  if (blockers.length > 0) {
    let action: Exclude<CompoundingLedgerAction, "record_compounding_increment"> = "block_incomplete_increment";
    if (blockers.some((blocker) => blocker.includes("already recorded") || blocker.includes("unspent capability"))) {
      action = "block_repeated_increment";
    } else if (blockers.some((blocker) => blocker.includes("non-proof executable"))) {
      action = "block_non_executable_increment";
    }

    return {
      ok: false,
      action,
      branch: input.branch,
      head_sha: input.live_head_sha,
      ledger_entry: null,
      decisive_evidence: [],
      blockers,
      next_route: "choose an executable embodiment increment that advances a new capability axis, or emit one exact external blocker",
    };
  }

  const ledgerEntry: PriorEmbodimentIncrement = {
    increment_id: candidate.increment_id,
    artifact_class: candidate.artifact_class,
    capability_axes: candidateAxes,
    routing_effects: textPresent(candidate.routing_effects),
  };

  return {
    ok: true,
    action: "record_compounding_increment",
    branch: input.branch,
    head_sha: input.live_head_sha,
    ledger_entry: ledgerEntry,
    decisive_evidence: candidateEvidence(candidate, newAxes),
    blockers: [],
    next_route: "commit the compounding embodiment increment, then read only the moved-head status surface",
  };
}
