export type ScheduledRouteCandidateKind = "external_embodiment" | "fresh_status_readback" | "exact_blocker";

export type ScheduledRouteExhaustionAction =
  | "admit_unspent_scheduled_route"
  | "block_all_scheduled_routes_spent"
  | "block_missing_route_evidence";

export interface ScheduledRouteCandidate {
  candidate_id: string;
  kind: ScheduledRouteCandidateKind;
  move_class: string;
  artifact_class: string;
  proof_module: string;
  changed_files: string[];
  routing_evidence: string[];
  blocker?: string;
}

export interface ScheduledRouteExhaustionFilterInput {
  active_branch: string;
  live_head_sha: string;
  spent_move_classes: string[];
  spent_artifact_classes: string[];
  spent_proof_modules: string[];
  candidates: ScheduledRouteCandidate[];
}

export interface ScheduledRouteRejection {
  candidate_id: string;
  reasons: string[];
}

export interface ScheduledRouteExhaustionFilterVerdict {
  ok: boolean;
  action: ScheduledRouteExhaustionAction;
  branch: string;
  head_sha: string;
  selected: ScheduledRouteCandidate | null;
  rejected: ScheduledRouteRejection[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function normalizeSet(values: string[]): Set<string> {
  return new Set(values.map((value) => value.trim()).filter(Boolean));
}

function executablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function candidateEvidence(candidate: ScheduledRouteCandidate): string[] {
  return [
    candidate.candidate_id,
    candidate.kind,
    candidate.move_class,
    candidate.artifact_class,
    candidate.proof_module,
    ...candidate.changed_files.filter(executablePlatformPath),
    ...candidate.routing_evidence,
    ...(candidate.blocker ? [candidate.blocker] : []),
  ];
}

function missingEvidence(candidate: ScheduledRouteCandidate): string[] {
  const blockers: string[] = [];

  if (!candidate.candidate_id.trim()) blockers.push("scheduled route candidate has no id");
  if (!candidate.move_class.trim()) blockers.push(`${candidate.candidate_id || "<unknown>"} has no move class`);
  if (!candidate.artifact_class.trim()) blockers.push(`${candidate.candidate_id || "<unknown>"} has no artifact class`);
  if (!candidate.proof_module.trim()) blockers.push(`${candidate.candidate_id || "<unknown>"} has no proof module`);

  if (candidate.kind === "external_embodiment") {
    if (!candidate.changed_files.some(executablePlatformPath)) {
      blockers.push(`${candidate.candidate_id || "<unknown>"} changes no executable platform file`);
    }
    if (candidate.routing_evidence.length === 0) {
      blockers.push(`${candidate.candidate_id || "<unknown>"} has no routing evidence`);
    }
  }

  if (candidate.kind === "exact_blocker" && !candidate.blocker?.trim()) {
    blockers.push(`${candidate.candidate_id || "<unknown>"} has no exact blocker text`);
  }

  return blockers;
}

function routePriority(candidate: ScheduledRouteCandidate): number {
  switch (candidate.kind) {
    case "external_embodiment":
      return 3;
    case "fresh_status_readback":
      return 2;
    case "exact_blocker":
      return 1;
  }
}

export function filterScheduledRouteExhaustion(
  input: ScheduledRouteExhaustionFilterInput,
): ScheduledRouteExhaustionFilterVerdict {
  const spentMoveClasses = normalizeSet(input.spent_move_classes);
  const spentArtifactClasses = normalizeSet(input.spent_artifact_classes);
  const spentProofModules = normalizeSet(input.spent_proof_modules);
  const rejected: ScheduledRouteRejection[] = [];
  const selectable: ScheduledRouteCandidate[] = [];

  for (const candidate of input.candidates) {
    const reasons = missingEvidence(candidate);

    if (spentMoveClasses.has(candidate.move_class)) {
      reasons.push(`scheduled route repeats spent move class: ${candidate.move_class}`);
    }
    if (spentArtifactClasses.has(candidate.artifact_class)) {
      reasons.push(`scheduled route repeats spent artifact class: ${candidate.artifact_class}`);
    }
    if (spentProofModules.has(candidate.proof_module)) {
      reasons.push(`scheduled route repeats spent proof module: ${candidate.proof_module}`);
    }

    if (reasons.length > 0) {
      rejected.push({ candidate_id: candidate.candidate_id || "<unknown>", reasons });
      continue;
    }

    selectable.push(candidate);
  }

  selectable.sort((left, right) => routePriority(right) - routePriority(left));
  const selected = selectable[0] ?? null;

  if (!selected && input.candidates.length === 0) {
    return {
      ok: false,
      action: "block_missing_route_evidence",
      branch: input.active_branch,
      head_sha: input.live_head_sha,
      selected: null,
      rejected,
      decisive_evidence: [],
      blockers: ["no scheduled route candidates supplied"],
      next_route: "supply an unspent external embodiment, fresh status readback, or exact blocker candidate before scheduled finalization",
    };
  }

  if (!selected) {
    return {
      ok: false,
      action: "block_all_scheduled_routes_spent",
      branch: input.active_branch,
      head_sha: input.live_head_sha,
      selected: null,
      rejected,
      decisive_evidence: rejected.flatMap((entry) => [entry.candidate_id, ...entry.reasons]),
      blockers: ["all scheduled route candidates are missing evidence or repeat spent route classes"],
      next_route: "synthesize a genuinely unspent route class before scheduled finalization continues",
    };
  }

  return {
    ok: true,
    action: "admit_unspent_scheduled_route",
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    selected,
    rejected,
    decisive_evidence: candidateEvidence(selected),
    blockers: [],
    next_route: "pass only the admitted unspent route candidate into scheduled finalization decision routing",
  };
}
