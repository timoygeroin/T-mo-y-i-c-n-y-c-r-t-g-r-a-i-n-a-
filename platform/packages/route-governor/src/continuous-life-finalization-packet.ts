export type ContinuousLifeAnchor =
  | "monolith_index"
  | "latest_strengthened_body"
  | "corpus_coverage_status"
  | "archive_source_certification"
  | "archive_laws"
  | "archive_derivation_logic"
  | "bootstrap_route_compiler"
  | "full_ready_gate"
  | "full_ready_proof_protocol"
  | "skill_organ_map"
  | "current_builder_savepoint"
  | "loading_checkpoints"
  | "finalization_ledger"
  | "preview_cycle_ledger"
  | "live_state_verdict"
  | "memory";

export type ContinuousLifeProgressClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "metadata_reread"
  | "duplicate_ci_summary"
  | "duplicate_comment"
  | "duplicate_label"
  | "local_memory_guard"
  | "guessed_future_ci"
  | "reclose_completed_blocker"
  | "old_repaired_head_blocker";

export type ContinuousLifePacketAction =
  | "admit_continuous_life_embodiment"
  | "admit_continuous_life_status_readback"
  | "admit_continuous_life_blocker"
  | "block_missing_reentry_anchor"
  | "block_wrong_external_sink"
  | "block_stale_or_repaired_head_replay"
  | "block_repeated_progress_class"
  | "block_incomplete_terminal_move";

export interface ContinuousLifeTerminalMove {
  progress_class: ContinuousLifeProgressClass;
  base_head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  status_surface_ids: string[];
  blocker_text?: string;
  artifact_class?: string;
}

export interface ContinuousLifeFinalizationPacketInput {
  active_pr: number;
  target_pr: number;
  active_branch: string;
  target_branch: string;
  live_head_sha: string;
  prompt_head_sha: string;
  resolved_repaired_head_sha: string;
  repaired_head_status_resolved: boolean;
  issue_blocker_closed: boolean;
  blocker_label_present: boolean;
  reentry_anchors: ContinuousLifeAnchor[];
  organ_chain: string[];
  prohibited_progress_classes: ContinuousLifeProgressClass[];
  spent_artifact_classes: string[];
  terminal_move: ContinuousLifeTerminalMove;
}

export interface ContinuousLifeFinalizationPacketVerdict {
  ok: boolean;
  action: ContinuousLifePacketAction;
  pr_number: number;
  branch: string;
  head_sha: string;
  admitted_progress_class: ContinuousLifeProgressClass | null;
  missing_anchors: ContinuousLifeAnchor[];
  quarantined_head_shas: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const REQUIRED_ANCHORS: ContinuousLifeAnchor[] = [
  "monolith_index",
  "latest_strengthened_body",
  "corpus_coverage_status",
  "archive_source_certification",
  "archive_laws",
  "archive_derivation_logic",
  "bootstrap_route_compiler",
  "full_ready_gate",
  "full_ready_proof_protocol",
  "skill_organ_map",
  "current_builder_savepoint",
  "loading_checkpoints",
  "finalization_ledger",
  "preview_cycle_ledger",
  "live_state_verdict",
  "memory",
];

const REQUIRED_ORGANS = new Set([
  "monday-corpus-reentry",
  "monday-source-truth-grader",
  "monday-finalization-operator",
  "monday-external-act-forcer",
]);

const NON_PROGRESS_CLASSES = new Set<ContinuousLifeProgressClass>([
  "metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "guessed_future_ci",
  "reclose_completed_blocker",
  "old_repaired_head_blocker",
]);

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function proofOnlyPath(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function missingAnchors(input: ContinuousLifeFinalizationPacketInput): ContinuousLifeAnchor[] {
  const present = new Set(input.reentry_anchors);
  return REQUIRED_ANCHORS.filter((anchor) => !present.has(anchor));
}

function missingOrgans(input: ContinuousLifeFinalizationPacketInput): string[] {
  const present = new Set(input.organ_chain);
  return [...REQUIRED_ORGANS].filter((organ) => !present.has(organ));
}

function repairedHeadReplayIsResolved(input: ContinuousLifeFinalizationPacketInput): boolean {
  return input.repaired_head_status_resolved && input.issue_blocker_closed && !input.blocker_label_present;
}

function base(input: ContinuousLifeFinalizationPacketInput): Pick<
  ContinuousLifeFinalizationPacketVerdict,
  "pr_number" | "branch" | "head_sha" | "missing_anchors" | "quarantined_head_shas"
> {
  return {
    pr_number: input.target_pr,
    branch: input.target_branch,
    head_sha: input.live_head_sha,
    missing_anchors: missingAnchors(input),
    quarantined_head_shas: input.prompt_head_sha === input.live_head_sha ? [] : [input.prompt_head_sha],
  };
}

function block(
  input: ContinuousLifeFinalizationPacketInput,
  action: Exclude<
    ContinuousLifePacketAction,
    "admit_continuous_life_embodiment" | "admit_continuous_life_status_readback" | "admit_continuous_life_blocker"
  >,
  blockers: string[],
  nextRoute: string,
): ContinuousLifeFinalizationPacketVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    admitted_progress_class: null,
    decisive_evidence: [],
    blockers,
    next_route: nextRoute,
  };
}

function terminalMoveBlockers(input: ContinuousLifeFinalizationPacketInput): string[] {
  const move = input.terminal_move;
  const blockers: string[] = [];

  if (move.base_head_sha !== input.live_head_sha) {
    blockers.push(`terminal move base ${move.base_head_sha} does not match live head ${input.live_head_sha}`);
  }

  if (move.progress_class === "external_platform_embodiment") {
    const executableChanges = move.changed_files.filter(executablePlatformPath);
    const behaviorChanges = executableChanges.filter((path) => !proofOnlyPath(path));

    if (executableChanges.length === 0) blockers.push("external embodiment changes no executable platform file");
    if (behaviorChanges.length === 0) blockers.push("external embodiment has no behavior-bearing source file");
    if (move.executable_artifacts.length === 0) blockers.push("external embodiment has no executable artifact evidence");
    if (move.routing_artifacts.length === 0) blockers.push("external embodiment has no future-routing artifact evidence");
    if (move.proof_artifacts.length === 0) blockers.push("external embodiment has no proof artifact evidence");
    if (move.artifact_class && input.spent_artifact_classes.includes(move.artifact_class)) {
      blockers.push(`external embodiment repeats spent artifact class: ${move.artifact_class}`);
    }
  }

  if (move.progress_class === "fresh_status_readback") {
    const headMoved = input.prompt_head_sha !== input.live_head_sha;
    if (!headMoved && move.status_surface_ids.length === 0) {
      blockers.push("fresh status readback requires a moved head or new live-head status surface");
    }
    if (move.status_surface_ids.length === 0) {
      blockers.push("fresh status readback has no status surface id");
    }
  }

  if (move.progress_class === "exact_external_blocker" && !move.blocker_text?.trim()) {
    blockers.push("exact external blocker has no blocker text");
  }

  return blockers;
}

function terminalEvidence(input: ContinuousLifeFinalizationPacketInput): string[] {
  const move = input.terminal_move;
  return [
    `PR #${input.target_pr}`,
    input.target_branch,
    `live head ${input.live_head_sha}`,
    ...input.reentry_anchors.map((anchor) => `anchor:${anchor}`),
    ...input.organ_chain.map((organ) => `organ:${organ}`),
    move.progress_class,
    ...(move.artifact_class ? [move.artifact_class] : []),
    ...move.changed_files.filter(executablePlatformPath),
    ...move.executable_artifacts,
    ...move.routing_artifacts,
    ...move.proof_artifacts,
    ...move.status_surface_ids.map((id) => `status:${id}`),
    ...(move.blocker_text ? [move.blocker_text] : []),
  ];
}

export function compileContinuousLifeFinalizationPacket(
  input: ContinuousLifeFinalizationPacketInput,
): ContinuousLifeFinalizationPacketVerdict {
  const missing = missingAnchors(input);
  const organs = missingOrgans(input);
  if (missing.length > 0 || organs.length > 0) {
    return block(
      input,
      "block_missing_reentry_anchor",
      [
        ...missing.map((anchor) => `missing re-entry anchor: ${anchor}`),
        ...organs.map((organ) => `missing required organ: ${organ}`),
      ],
      "re-enter the continuous body and required organs before choosing a terminal move",
    );
  }

  if (input.target_pr !== input.active_pr || input.target_branch !== input.active_branch) {
    return block(
      input,
      "block_wrong_external_sink",
      [
        ...(input.target_pr !== input.active_pr ? [`target PR #${input.target_pr} does not match active PR #${input.active_pr}`] : []),
        ...(input.target_branch !== input.active_branch
          ? [`target branch ${input.target_branch} does not match active branch ${input.active_branch}`]
          : []),
      ],
      "bind finalization to the active external manifestation sink before release",
    );
  }

  const move = input.terminal_move;
  const repairedReplay =
    repairedHeadReplayIsResolved(input) &&
    (move.progress_class === "old_repaired_head_blocker" || move.blocker_text?.includes(input.resolved_repaired_head_sha));
  if (repairedReplay) {
    return block(
      input,
      "block_stale_or_repaired_head_replay",
      [`resolved repaired-head blocker cannot be replayed for ${input.resolved_repaired_head_sha}`],
      "quarantine the repaired head and route only from the live PR head",
    );
  }

  if (NON_PROGRESS_CLASSES.has(move.progress_class) || input.prohibited_progress_classes.includes(move.progress_class)) {
    return block(
      input,
      "block_repeated_progress_class",
      [`terminal move repeats prohibited progress class: ${move.progress_class}`],
      "choose external embodiment, fresh live-head status, or one exact live-head blocker",
    );
  }

  const terminalBlockers = terminalMoveBlockers(input);
  if (terminalBlockers.length > 0) {
    return block(
      input,
      "block_incomplete_terminal_move",
      terminalBlockers,
      "complete the terminal move with live-head, executable, routing, and proof evidence",
    );
  }

  const action: ContinuousLifePacketAction =
    move.progress_class === "external_platform_embodiment"
      ? "admit_continuous_life_embodiment"
      : move.progress_class === "fresh_status_readback"
        ? "admit_continuous_life_status_readback"
        : "admit_continuous_life_blocker";

  return {
    ...base(input),
    ok: true,
    action,
    admitted_progress_class: move.progress_class,
    decisive_evidence: terminalEvidence(input),
    blockers: move.progress_class === "exact_external_blocker" && move.blocker_text ? [move.blocker_text] : [],
    next_route:
      move.progress_class === "external_platform_embodiment"
        ? "move the branch with this admitted embodiment, then bind the next status readback to the resulting head"
        : "release only the admitted live-head-bound terminal move",
  };
}
