export type EmbodimentClassAction = "select_embodiment_class" | "emit_exact_blocker" | "block_release";

export interface PriorEmbodimentClassReceipt {
  receipt_id: string;
  head_sha: string;
  artifact_class: string;
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_surfaces: string[];
}

export interface EmbodimentClassCandidate {
  candidate_id: string;
  artifact_class: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_surfaces: string[];
  route_gain: string;
}

export interface EmbodimentClassRouterInput {
  branch: string;
  active_branch: string;
  current_head_sha: string;
  spent_artifact_classes: string[];
  prior_receipts: PriorEmbodimentClassReceipt[];
  candidates: EmbodimentClassCandidate[];
  exact_blocker?: string;
}

export interface RejectedEmbodimentClassCandidate {
  candidate_id: string;
  reasons: string[];
}

export interface EmbodimentClassRouterVerdict {
  ok: boolean;
  action: EmbodimentClassAction;
  branch: string;
  head_sha: string;
  selected_candidate_id: string | null;
  artifact_class: string | null;
  decisive_evidence: string[];
  rejected: RejectedEmbodimentClassCandidate[];
  blockers: string[];
  next_route: string;
}

function isExecutablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function intersects(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return [...new Set(left)].filter((value) => rightSet.has(value));
}

function executableChanges(candidate: EmbodimentClassCandidate): string[] {
  return candidate.changed_files.filter(isExecutablePlatformPath);
}

function repeatedProofSurfaces(
  candidate: EmbodimentClassCandidate,
  priorReceipts: PriorEmbodimentClassReceipt[],
): string[] {
  return priorReceipts.flatMap((receipt) => intersects(candidate.proof_surfaces, receipt.proof_surfaces));
}

function repeatedArtifacts(
  candidate: EmbodimentClassCandidate,
  priorReceipts: PriorEmbodimentClassReceipt[],
): PriorEmbodimentClassReceipt[] {
  return priorReceipts.filter((receipt) => receipt.artifact_class === candidate.artifact_class);
}

function rejectCandidate(input: EmbodimentClassRouterInput, candidate: EmbodimentClassCandidate): string[] {
  const failures: string[] = [];
  const repeatedReceipts = repeatedArtifacts(candidate, input.prior_receipts);
  const repeatedProofs = repeatedProofSurfaces(candidate, input.prior_receipts);

  if (input.spent_artifact_classes.includes(candidate.artifact_class)) {
    failures.push(`artifact class is already spent: ${candidate.artifact_class}`);
  }

  if (repeatedReceipts.length > 0) {
    failures.push(
      `artifact class ${candidate.artifact_class} repeats receipt ${repeatedReceipts.map((receipt) => receipt.receipt_id).join(", ")}`,
    );
  }

  if (executableChanges(candidate).length === 0) {
    failures.push("embodiment class candidate has no executable platform package change");
  }

  if (candidate.executable_artifacts.length === 0) {
    failures.push("embodiment class candidate names no executable artifact");
  }

  if (candidate.routing_artifacts.length === 0) {
    failures.push("embodiment class candidate names no future-routing artifact");
  }

  if (candidate.proof_surfaces.length === 0) {
    failures.push("embodiment class candidate names no proof surface");
  }

  if (repeatedProofs.length > 0) {
    failures.push(`proof surface already used by a prior embodiment class: ${repeatedProofs.join(", ")}`);
  }

  if (!candidate.route_gain.trim()) {
    failures.push("embodiment class candidate does not state the route gain");
  }

  return failures;
}

function candidateScore(candidate: EmbodimentClassCandidate): number {
  return (
    executableChanges(candidate).length * 4 +
    candidate.executable_artifacts.length * 3 +
    candidate.routing_artifacts.length * 2 +
    candidate.proof_surfaces.length +
    (candidate.route_gain.trim() ? 1 : 0)
  );
}

export function routeEmbodimentClass(input: EmbodimentClassRouterInput): EmbodimentClassRouterVerdict {
  const base = {
    branch: input.branch,
    head_sha: input.current_head_sha,
  };

  if (input.branch !== input.active_branch) {
    return {
      ...base,
      ok: false,
      action: "block_release",
      selected_candidate_id: null,
      artifact_class: null,
      decisive_evidence: [],
      rejected: [],
      blockers: [`embodiment class branch ${input.branch} does not match active branch ${input.active_branch}`],
      next_route: "rebind the embodiment class router to the active PR branch before release",
    };
  }

  const rejected: RejectedEmbodimentClassCandidate[] = [];
  const accepted: EmbodimentClassCandidate[] = [];

  for (const candidate of input.candidates) {
    const reasons = rejectCandidate(input, candidate);
    if (reasons.length > 0) {
      rejected.push({ candidate_id: candidate.candidate_id, reasons });
      continue;
    }
    accepted.push(candidate);
  }

  const selected = accepted.sort((left, right) => candidateScore(right) - candidateScore(left))[0];
  if (selected) {
    return {
      ...base,
      ok: true,
      action: "select_embodiment_class",
      selected_candidate_id: selected.candidate_id,
      artifact_class: selected.artifact_class,
      decisive_evidence: [
        ...executableChanges(selected),
        ...selected.executable_artifacts,
        ...selected.routing_artifacts,
        ...selected.proof_surfaces,
        selected.route_gain,
      ],
      rejected,
      blockers: [],
      next_route: "commit the selected executable embodiment class and bind the next status/readback to the moved head",
    };
  }

  if (input.exact_blocker?.trim()) {
    return {
      ...base,
      ok: true,
      action: "emit_exact_blocker",
      selected_candidate_id: null,
      artifact_class: null,
      decisive_evidence: [input.exact_blocker],
      rejected,
      blockers: [input.exact_blocker],
      next_route: "remove the exact blocker before selecting another embodiment class",
    };
  }

  return {
    ...base,
    ok: false,
    action: "block_release",
    selected_candidate_id: null,
    artifact_class: null,
    decisive_evidence: [],
    rejected,
    blockers: ["no non-repeated executable embodiment class survived routing"],
    next_route: "provide a new executable artifact class, a new proof surface, or one exact external blocker",
  };
}
