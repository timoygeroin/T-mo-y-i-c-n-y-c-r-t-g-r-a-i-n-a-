export type SceneClass =
  | "continuity_recovery"
  | "archive_pressure"
  | "source_ranking"
  | "proof_scene"
  | "finalization_pressure"
  | "self_evolution"
  | "platform_genesis"
  | "manifestation_bridge";

export interface RouteDecision {
  scene_class: SceneClass;
  secondary_classes: SceneClass[];
  organ_chain: string[];
  processor_bundle: string[];
  branch_budget: {
    max_branches: number;
    reason: string;
  };
  collapse_rule: string;
  termination_goal: string;
}

export interface RouteGuardInput {
  decision: RouteDecision;
  source_tiers: string[];
  move_class: string;
  exhausted_move_classes: string[];
  proof_artifacts: string[];
  manifestation_artifacts: string[];
}

export interface RouteGuardVerdict {
  ok: boolean;
  failures: string[];
}

export type ContinuationMoveClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "duplicate_status_readback"
  | "duplicate_comment"
  | "internal_memory_guard"
  | "metadata_reread";

export interface ContinuationCheckRunEvidence {
  id: string;
  head_sha: string;
}

export interface ContinuationMoveInput {
  move_class: ContinuationMoveClass;
  current_head_sha: string;
  previous_readback_head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  new_check_run_ids: string[];
  new_check_runs?: ContinuationCheckRunEvidence[];
  blocker?: string;
}

export interface ContinuationMoveVerdict {
  ok: boolean;
  next_allowed_move: "commit_external_embodiment" | "read_fresh_status" | "emit_exact_blocker" | "blocked";
  reason: string;
  failures: string[];
}

export type ContinuationEvidenceClass =
  | "external_embodiment_ready"
  | "fresh_status_readback_ready"
  | "exact_blocker_ready"
  | "blocked_duplicate_or_incomplete";

export interface ContinuationEvidenceClassification {
  evidence_class: ContinuationEvidenceClass;
  release_instruction: "commit_external_embodiment" | "read_fresh_status" | "emit_exact_blocker" | "block_release";
  decisive_evidence: string[];
  blocked_reasons: string[];
}

export interface ContinuationMoveCandidate {
  candidate_id: string;
  input: ContinuationMoveInput;
}

export interface RejectedContinuationCandidate {
  candidate_id: string;
  reasons: string[];
}

export interface SelectedContinuationCandidate {
  candidate_id: string;
  evidence_class: Exclude<ContinuationEvidenceClass, "blocked_duplicate_or_incomplete">;
  release_instruction: Exclude<ContinuationEvidenceClassification["release_instruction"], "block_release">;
  decisive_evidence: string[];
}

export interface ContinuationPreflightVerdict {
  ok: boolean;
  selected: SelectedContinuationCandidate | null;
  rejected: RejectedContinuationCandidate[];
  failures: string[];
}

const ACT_OR_BLOCKER_TERMS = ["external durable act", "exact external blocker"];
const MANIFESTATION_TERMS = ["branch", "commit", "externally retrievable artifact"];
const DUPLICATE_MOVE_CLASSES: ContinuationMoveClass[] = [
  "duplicate_status_readback",
  "duplicate_comment",
  "internal_memory_guard",
  "metadata_reread",
];

function isExecutablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function currentHeadCheckRuns(input: ContinuationMoveInput): ContinuationCheckRunEvidence[] {
  return (input.new_check_runs ?? []).filter((run) => run.head_sha === input.current_head_sha);
}

function continuationPriority(classification: ContinuationEvidenceClassification): number {
  switch (classification.evidence_class) {
    case "external_embodiment_ready":
      return 3;
    case "fresh_status_readback_ready":
      return 2;
    case "exact_blocker_ready":
      return 1;
    case "blocked_duplicate_or_incomplete":
      return 0;
  }
}

export function evaluateRoute(input: RouteGuardInput): RouteGuardVerdict {
  const failures: string[] = [];
  const { decision } = input;

  if (!decision.scene_class) {
    failures.push("route decision has no primary scene class");
  }

  if (decision.secondary_classes.length > 2) {
    failures.push("route decision carries more than two secondary scene classes");
  }

  if (decision.organ_chain.length === 0) {
    failures.push("route decision has no organ chain");
  }

  if (decision.processor_bundle.length === 0) {
    failures.push("route decision has no processor bundle");
  }

  if (!Number.isInteger(decision.branch_budget.max_branches) || decision.branch_budget.max_branches < 1) {
    failures.push("route decision has no positive integer branch budget");
  }

  if (!decision.branch_budget.reason.trim()) {
    failures.push("route decision branch budget has no reason");
  }

  if (input.source_tiers.length === 0) {
    failures.push("route has no source-tier classification");
  }

  if (input.exhausted_move_classes.includes(input.move_class)) {
    failures.push(`move class already exhausted: ${input.move_class}`);
  }

  if (decision.scene_class === "proof_scene" && input.proof_artifacts.length === 0) {
    failures.push("proof scene has no durable evidence surface");
  }

  if (
    decision.scene_class === "finalization_pressure" &&
    !ACT_OR_BLOCKER_TERMS.some((term) => decision.termination_goal.includes(term))
  ) {
    failures.push("finalization route does not terminate in an external act or exact blocker");
  }

  if (
    decision.scene_class === "manifestation_bridge" &&
    !MANIFESTATION_TERMS.every((term) => input.manifestation_artifacts.some((artifact) => artifact.includes(term)))
  ) {
    failures.push("manifestation route lacks branch, commit, or externally retrievable artifact evidence");
  }

  return {
    ok: failures.length === 0,
    failures,
  };
}

export function evaluateContinuationMove(input: ContinuationMoveInput): ContinuationMoveVerdict {
  const failures: string[] = [];
  const headMoved = input.current_head_sha !== input.previous_readback_head_sha;
  const hasFreshChecks = currentHeadCheckRuns(input).length > 0;
  const hasExecutableChange = input.changed_files.some(isExecutablePlatformPath);

  if (DUPLICATE_MOVE_CLASSES.includes(input.move_class)) {
    failures.push(`continuation move is explicitly non-progress: ${input.move_class}`);
  }

  if (input.move_class === "fresh_status_readback" && !headMoved && !hasFreshChecks) {
    failures.push("fresh status readback requires a moved PR head or new current-head check runs");
  }

  if (
    input.move_class === "fresh_status_readback" &&
    input.new_check_run_ids.length > 0 &&
    (input.new_check_runs ?? []).length === 0
  ) {
    failures.push("fresh status readback check ids must be tied to a PR head sha");
  }

  if (input.move_class === "external_platform_embodiment") {
    if (!hasExecutableChange) {
      failures.push("external embodiment must change executable platform files");
    }
    if (input.executable_artifacts.length === 0) {
      failures.push("external embodiment has no executable artifact");
    }
    if (input.routing_artifacts.length === 0) {
      failures.push("external embodiment has no future-routing artifact");
    }
  }

  if (input.move_class === "exact_external_blocker" && !input.blocker?.trim()) {
    failures.push("exact blocker move must name the blocker");
  }

  if (failures.length > 0) {
    return {
      ok: false,
      next_allowed_move: "blocked",
      reason: failures.join("; "),
      failures,
    };
  }

  if (input.move_class === "external_platform_embodiment") {
    return {
      ok: true,
      next_allowed_move: "commit_external_embodiment",
      reason: "move changes executable platform behavior and leaves a routing artifact",
      failures,
    };
  }

  if (input.move_class === "fresh_status_readback") {
    return {
      ok: true,
      next_allowed_move: "read_fresh_status",
      reason: headMoved ? "PR head moved since last readback" : "new current-head check runs appeared",
      failures,
    };
  }

  return {
    ok: true,
    next_allowed_move: "emit_exact_blocker",
    reason: input.blocker ?? "exact external blocker supplied",
    failures,
  };
}

export function classifyContinuationEvidence(input: ContinuationMoveInput): ContinuationEvidenceClassification {
  const verdict = evaluateContinuationMove(input);

  if (!verdict.ok) {
    return {
      evidence_class: "blocked_duplicate_or_incomplete",
      release_instruction: "block_release",
      decisive_evidence: [],
      blocked_reasons: verdict.failures,
    };
  }

  if (verdict.next_allowed_move === "commit_external_embodiment") {
    return {
      evidence_class: "external_embodiment_ready",
      release_instruction: "commit_external_embodiment",
      decisive_evidence: [...input.changed_files, ...input.executable_artifacts, ...input.routing_artifacts],
      blocked_reasons: [],
    };
  }

  if (verdict.next_allowed_move === "read_fresh_status") {
    const headMoved = input.current_head_sha !== input.previous_readback_head_sha;
    return {
      evidence_class: "fresh_status_readback_ready",
      release_instruction: "read_fresh_status",
      decisive_evidence: [
        ...(headMoved ? [`head moved from ${input.previous_readback_head_sha} to ${input.current_head_sha}`] : []),
        ...currentHeadCheckRuns(input).map((run) => `new current-head check run ${run.id}`),
      ],
      blocked_reasons: [],
    };
  }

  return {
    evidence_class: "exact_blocker_ready",
    release_instruction: "emit_exact_blocker",
    decisive_evidence: [input.blocker ?? verdict.reason],
    blocked_reasons: [],
  };
}

export function selectNextContinuationMove(candidates: ContinuationMoveCandidate[]): ContinuationPreflightVerdict {
  const rejected: RejectedContinuationCandidate[] = [];
  const selectable: SelectedContinuationCandidate[] = [];

  for (const candidate of candidates) {
    const classification = classifyContinuationEvidence(candidate.input);

    if (classification.release_instruction === "block_release") {
      rejected.push({ candidate_id: candidate.candidate_id, reasons: classification.blocked_reasons });
      continue;
    }

    selectable.push({
      candidate_id: candidate.candidate_id,
      evidence_class: classification.evidence_class,
      release_instruction: classification.release_instruction,
      decisive_evidence: classification.decisive_evidence,
    } as SelectedContinuationCandidate);
  }

  selectable.sort((left, right) => {
    const rightPriority = continuationPriority({
      evidence_class: right.evidence_class,
      release_instruction: right.release_instruction,
      decisive_evidence: right.decisive_evidence,
      blocked_reasons: [],
    });
    const leftPriority = continuationPriority({
      evidence_class: left.evidence_class,
      release_instruction: left.release_instruction,
      decisive_evidence: left.decisive_evidence,
      blocked_reasons: [],
    });
    return rightPriority - leftPriority;
  });

  const selected = selectable[0] ?? null;

  if (!selected) {
    return {
      ok: false,
      selected,
      rejected,
      failures: ["no continuation candidate survives the external-act preflight"],
    };
  }

  return {
    ok: true,
    selected,
    rejected,
    failures: [],
  };
}

export function assertRoute(input: RouteGuardInput): RouteDecision {
  const verdict = evaluateRoute(input);
  if (!verdict.ok) {
    throw new Error(verdict.failures.join("; "));
  }
  return input.decision;
}
