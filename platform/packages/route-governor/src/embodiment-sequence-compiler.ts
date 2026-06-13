export type EmbodimentSequenceMoveClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "duplicate_ci_summary"
  | "metadata_reread";

export type EmbodimentSequenceStage =
  | "current_surface_intake"
  | "status_authority_boundary"
  | "terminal_progress_admission"
  | "route_progress_ledger"
  | "live_progress_receipt"
  | "next_status_binding";

export type EmbodimentSequenceAction =
  | "admit_embodiment_sequence"
  | "block_branch_mismatch"
  | "block_non_progress_move"
  | "block_stale_base_head"
  | "block_incomplete_sequence"
  | "block_replayed_artifact_class"
  | "block_unmoved_result_head";

export interface EmbodimentSequenceStageEvidence {
  stage: EmbodimentSequenceStage;
  evidence_ids: string[];
}

export interface EmbodimentSequenceCandidate {
  sequence_id: string;
  move_class: EmbodimentSequenceMoveClass;
  branch: string;
  base_head_sha: string;
  artifact_class: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  stage_evidence: EmbodimentSequenceStageEvidence[];
  resulting_head_sha?: string;
  next_status_expected_head?: string;
}

export interface EmbodimentSequenceInput {
  active_branch: string;
  live_head_sha: string;
  previous_status_head_sha: string;
  prohibited_move_classes: EmbodimentSequenceMoveClass[];
  spent_artifact_classes: string[];
  candidate: EmbodimentSequenceCandidate;
}

export interface EmbodimentSequenceVerdict {
  ok: boolean;
  action: EmbodimentSequenceAction;
  branch: string;
  base_head_sha: string;
  next_status_expected_head: string | null;
  sequence_steps: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const REQUIRED_STAGES: EmbodimentSequenceStage[] = [
  "current_surface_intake",
  "terminal_progress_admission",
  "route_progress_ledger",
  "live_progress_receipt",
  "next_status_binding",
];

const NON_PROGRESS_MOVES = new Set<EmbodimentSequenceMoveClass>([
  "fresh_status_readback",
  "duplicate_ci_summary",
  "metadata_reread",
]);

function executablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function base(input: EmbodimentSequenceInput): Pick<
  EmbodimentSequenceVerdict,
  "branch" | "base_head_sha" | "next_status_expected_head"
> {
  const candidate = input.candidate;
  return {
    branch: input.active_branch,
    base_head_sha: input.live_head_sha,
    next_status_expected_head: candidate.next_status_expected_head ?? candidate.resulting_head_sha ?? null,
  };
}

function block(
  input: EmbodimentSequenceInput,
  action: Exclude<EmbodimentSequenceAction, "admit_embodiment_sequence">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): EmbodimentSequenceVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    sequence_steps: [],
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function missingStages(candidate: EmbodimentSequenceCandidate): string[] {
  return REQUIRED_STAGES.filter((stage) => {
    const evidence = candidate.stage_evidence.find((item) => item.stage === stage);
    return !evidence || evidence.evidence_ids.length === 0;
  });
}

function incompleteCandidate(candidate: EmbodimentSequenceCandidate): string[] {
  const blockers: string[] = [];

  if (!candidate.sequence_id.trim()) blockers.push("embodiment sequence has no sequence id");
  if (!candidate.artifact_class.trim()) blockers.push("embodiment sequence has no artifact class");
  if (!candidate.changed_files.some(executablePlatformPath)) {
    blockers.push("embodiment sequence changes no executable platform file");
  }
  if (candidate.executable_artifacts.length === 0) {
    blockers.push("embodiment sequence has no executable artifact evidence");
  }
  if (candidate.routing_artifacts.length === 0) {
    blockers.push("embodiment sequence has no future-routing artifact evidence");
  }
  if (candidate.proof_artifacts.length === 0) {
    blockers.push("embodiment sequence has no proof artifact evidence");
  }

  for (const stage of missingStages(candidate)) {
    blockers.push(`embodiment sequence is missing stage evidence: ${stage}`);
  }

  return blockers;
}

function stageEvidence(candidate: EmbodimentSequenceCandidate): string[] {
  return candidate.stage_evidence.flatMap((stage) => [stage.stage, ...stage.evidence_ids]);
}

export function compileEmbodimentSequence(input: EmbodimentSequenceInput): EmbodimentSequenceVerdict {
  const candidate = input.candidate;

  if (candidate.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`],
      "bind the embodiment sequence to the active manifestation branch before release",
    );
  }

  if (candidate.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_base_head",
      [`candidate base ${candidate.base_head_sha} is not live head ${input.live_head_sha}`],
      "rebase the full embodiment sequence to the live PR head before writing",
      [`previous status head ${input.previous_status_head_sha}`],
    );
  }

  if (input.prohibited_move_classes.includes(candidate.move_class) || NON_PROGRESS_MOVES.has(candidate.move_class)) {
    return block(
      input,
      "block_non_progress_move",
      [`embodiment sequence cannot be compiled from move class: ${candidate.move_class}`],
      "choose a non-repeated external platform embodiment sequence",
    );
  }

  if (candidate.move_class === "exact_external_blocker") {
    return block(
      input,
      "block_non_progress_move",
      ["an exact blocker is terminal and cannot be wrapped as an embodiment sequence"],
      "emit the exact blocker directly or compile an executable embodiment sequence",
    );
  }

  if (input.spent_artifact_classes.includes(candidate.artifact_class)) {
    return block(
      input,
      "block_replayed_artifact_class",
      [`artifact class already spent: ${candidate.artifact_class}`],
      "choose an unspent artifact class before moving the branch",
    );
  }

  const candidateFailures = incompleteCandidate(candidate);
  if (candidateFailures.length > 0) {
    return block(
      input,
      "block_incomplete_sequence",
      candidateFailures,
      "complete every required sequence stage before claiming external embodiment progress",
    );
  }

  if (candidate.resulting_head_sha && candidate.resulting_head_sha === input.live_head_sha) {
    return block(
      input,
      "block_unmoved_result_head",
      [`resulting head ${candidate.resulting_head_sha} does not move beyond live head ${input.live_head_sha}`],
      "write the executable embodiment and bind the receipt to the moved resulting head",
    );
  }

  if (
    candidate.resulting_head_sha &&
    candidate.next_status_expected_head &&
    candidate.next_status_expected_head !== candidate.resulting_head_sha
  ) {
    return block(
      input,
      "block_unmoved_result_head",
      [
        `next status expected head ${candidate.next_status_expected_head} does not match resulting head ${candidate.resulting_head_sha}`,
      ],
      "bind the next status readback to the exact resulting branch head",
    );
  }

  const nextHead = candidate.next_status_expected_head ?? candidate.resulting_head_sha ?? "post-write-head";

  return {
    ...base(input),
    ok: true,
    action: "admit_embodiment_sequence",
    next_status_expected_head: nextHead,
    sequence_steps: [
      `bind live surface ${input.active_branch}@${input.live_head_sha}`,
      "admit external platform embodiment as the terminal progress class",
      `write executable artifact class ${candidate.artifact_class}`,
      "append route-progress ledger evidence for the new artifact class",
      "issue live progress receipt after the branch moves",
      `require the next status readback for ${nextHead}`,
    ],
    decisive_evidence: [
      candidate.sequence_id,
      candidate.artifact_class,
      `base ${input.live_head_sha}`,
      ...(input.previous_status_head_sha !== input.live_head_sha
        ? [`prior status head expired ${input.previous_status_head_sha}`]
        : []),
      ...candidate.changed_files.filter(executablePlatformPath),
      ...candidate.executable_artifacts,
      ...candidate.routing_artifacts,
      ...candidate.proof_artifacts,
      ...stageEvidence(candidate),
    ],
    blockers: [],
    next_route: "execute this sequence as one embodiment event; do not count any individual stage as standalone progress",
  };
}
