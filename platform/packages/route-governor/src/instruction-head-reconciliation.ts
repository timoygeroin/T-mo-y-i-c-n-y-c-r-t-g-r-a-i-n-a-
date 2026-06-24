export type InstructionHeadReconciliationMove =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "duplicate_status_readback"
  | "metadata_reread"
  | "duplicate_comment"
  | "internal_memory_guard"
  | "warning_maintenance";

export type InstructionHeadReconciliationAction =
  | "select_external_embodiment"
  | "select_fresh_status_readback"
  | "emit_exact_external_blocker"
  | "block_historical_instruction_head"
  | "block_duplicate_or_non_progress"
  | "block_incomplete_embodiment"
  | "block_stale_check_delta"
  | "block_missing_blocker";

export interface InstructionHeadCandidate {
  candidate_id: string;
  move_class: InstructionHeadReconciliationMove;
  changed_files: string[];
  behavior_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  check_run_ids: string[];
  blocker?: string;
}

export interface InstructionHeadReconciliationInput {
  active_branch: string;
  instruction_head_sha: string;
  live_head_sha: string;
  resolved_historical_heads: string[];
  prior_readback_head_sha: string;
  spent_check_run_ids: string[];
  exhausted_move_classes: InstructionHeadReconciliationMove[];
  candidates: InstructionHeadCandidate[];
}

export interface InstructionHeadReconciliationVerdict {
  ok: boolean;
  action: InstructionHeadReconciliationAction;
  branch: string;
  live_head_sha: string;
  instruction_head_sha: string;
  selected_candidate_id: string | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_MOVES = new Set<InstructionHeadReconciliationMove>([
  "duplicate_status_readback",
  "metadata_reread",
  "duplicate_comment",
  "internal_memory_guard",
  "warning_maintenance",
]);

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function sourceBehaviorPath(path: string): boolean {
  return executablePlatformPath(path) && !/(?:\.test|-proof)\.ts$/.test(path);
}

function base(
  input: InstructionHeadReconciliationInput,
  action: InstructionHeadReconciliationAction,
  selectedCandidateId: string | null,
  ok: boolean,
  decisiveEvidence: string[],
  blockers: string[],
  nextRoute: string,
): InstructionHeadReconciliationVerdict {
  return {
    ok,
    action,
    branch: input.active_branch,
    live_head_sha: input.live_head_sha,
    instruction_head_sha: input.instruction_head_sha,
    selected_candidate_id: selectedCandidateId,
    decisive_evidence: decisiveEvidence,
    blockers,
    next_route: nextRoute,
  };
}

function candidateEvidence(candidate: InstructionHeadCandidate): string[] {
  return [
    candidate.candidate_id,
    candidate.move_class,
    ...candidate.changed_files,
    ...candidate.behavior_artifacts,
    ...candidate.routing_artifacts,
    ...candidate.proof_artifacts,
    ...candidate.check_run_ids.map((id) => `check:${id}`),
  ];
}

function embodimentBlockers(candidate: InstructionHeadCandidate): string[] {
  const blockers: string[] = [];

  if (!candidate.changed_files.some(sourceBehaviorPath)) {
    blockers.push("embodiment candidate has no behavior-bearing source file");
  }

  if (candidate.behavior_artifacts.length === 0) {
    blockers.push("embodiment candidate names no behavior artifact");
  }

  if (candidate.routing_artifacts.length === 0) {
    blockers.push("embodiment candidate names no future-routing artifact");
  }

  if (candidate.proof_artifacts.length === 0) {
    blockers.push("embodiment candidate names no proof artifact");
  }

  return blockers;
}

function freshCheckRunIds(input: InstructionHeadReconciliationInput, candidate: InstructionHeadCandidate): string[] {
  return candidate.check_run_ids.filter((id) => !input.spent_check_run_ids.includes(id));
}

export function reconcileInstructionHead(
  input: InstructionHeadReconciliationInput,
): InstructionHeadReconciliationVerdict {
  const instructionHeadIsHistorical = input.resolved_historical_heads.includes(input.instruction_head_sha);
  const liveHeadMoved = input.live_head_sha !== input.instruction_head_sha;
  const duplicateCandidates = input.candidates.filter(
    (candidate) =>
      NON_PROGRESS_MOVES.has(candidate.move_class) || input.exhausted_move_classes.includes(candidate.move_class),
  );

  const embodiment = input.candidates.find((candidate) => candidate.move_class === "external_platform_embodiment");
  if (embodiment) {
    const blockers = embodimentBlockers(embodiment);
    if (blockers.length === 0) {
      return base(
        input,
        "select_external_embodiment",
        embodiment.candidate_id,
        true,
        [
          instructionHeadIsHistorical ? `instruction head is resolved historical: ${input.instruction_head_sha}` : "instruction head accepted",
          liveHeadMoved ? `live head moved: ${input.live_head_sha}` : `live head unchanged: ${input.live_head_sha}`,
          ...candidateEvidence(embodiment),
        ],
        [],
        "commit the executable embodiment candidate on the active PR branch; do not consume repaired-head status as current authority",
      );
    }

    return base(
      input,
      "block_incomplete_embodiment",
      embodiment.candidate_id,
      false,
      candidateEvidence(embodiment),
      blockers,
      "complete the embodiment candidate or choose a truly fresh readback / exact blocker",
    );
  }

  const readback = input.candidates.find((candidate) => candidate.move_class === "fresh_status_readback");
  if (readback) {
    const freshIds = freshCheckRunIds(input, readback);
    const staleBecauseSameHead = input.live_head_sha === input.prior_readback_head_sha;
    if (freshIds.length > 0 && !staleBecauseSameHead) {
      return base(
        input,
        "select_fresh_status_readback",
        readback.candidate_id,
        true,
        [`fresh check ids: ${freshIds.join(",")}`, ...candidateEvidence(readback)],
        [],
        "read only the live moved-head status surface and record its exact check-run ids",
      );
    }

    return base(
      input,
      "block_stale_check_delta",
      readback.candidate_id,
      false,
      candidateEvidence(readback),
      [
        staleBecauseSameHead
          ? `live head already had readback: ${input.live_head_sha}`
          : "fresh status readback candidate has no unspent check-run ids",
      ],
      "supply a moved-head status delta or stop using readback as progress",
    );
  }

  const blocker = input.candidates.find((candidate) => candidate.move_class === "exact_external_blocker");
  if (blocker) {
    if (blocker.blocker?.trim()) {
      return base(
        input,
        "emit_exact_external_blocker",
        blocker.candidate_id,
        true,
        [blocker.blocker, ...candidateEvidence(blocker)],
        [],
        "emit this blocker only; do not replace it with historical status commentary",
      );
    }

    return base(
      input,
      "block_missing_blocker",
      blocker.candidate_id,
      false,
      candidateEvidence(blocker),
      ["exact external blocker candidate has no blocker text"],
      "name the external blocker exactly or choose embodiment / fresh status",
    );
  }

  if (instructionHeadIsHistorical && liveHeadMoved) {
    return base(
      input,
      "block_historical_instruction_head",
      null,
      false,
      [`instruction head ${input.instruction_head_sha}`, `live head ${input.live_head_sha}`],
      ["instruction head is a resolved historical head and cannot define the active route"],
      "rebase the route onto the live PR head before allowing any finalization move",
    );
  }

  return base(
    input,
    "block_duplicate_or_non_progress",
    duplicateCandidates[0]?.candidate_id ?? null,
    false,
    duplicateCandidates.flatMap(candidateEvidence),
    duplicateCandidates.length > 0
      ? ["only duplicate or exhausted move classes were offered"]
      : ["no valid continuation candidate was offered"],
    "offer exactly one external embodiment, fresh moved-head readback, or exact external blocker",
  );
}
