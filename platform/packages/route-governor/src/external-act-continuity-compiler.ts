export type ExternalActContinuityAction =
  | "compile_external_act"
  | "block_resolved_head_replay"
  | "block_wrong_branch"
  | "block_wrong_head"
  | "block_non_executable_candidate"
  | "block_spent_move_class";

export interface ExternalActCandidate {
  candidate_id: string;
  branch: string;
  head_sha: string;
  move_class: string;
  changed_files: string[];
  behavior_exports: string[];
  future_routing_effects: string[];
}

export interface ExternalActContinuityInput {
  active_branch: string;
  live_head_sha: string;
  resolved_head_shas: string[];
  exhausted_move_classes: string[];
  candidate: ExternalActCandidate;
}

export interface ExternalActContinuityVerdict {
  ok: boolean;
  action: ExternalActContinuityAction;
  candidate_id: string;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  write_instruction: string;
}

const SPENT_STATUS_MOVE_CLASSES = new Set([
  "metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "guessed_future_ci",
  "reclose_completed_blocker",
  "old_repaired_head_blocker",
  "repaired_head_status_readback",
]);

function executablePlatformFile(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(?:ts|js|mjs|json)$/.test(path);
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function block(
  input: ExternalActContinuityInput,
  action: Exclude<ExternalActContinuityAction, "compile_external_act">,
  blockers: string[],
  writeInstruction: string,
): ExternalActContinuityVerdict {
  return {
    ok: false,
    action,
    candidate_id: input.candidate.candidate_id,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    decisive_evidence: [],
    blockers,
    write_instruction: writeInstruction,
  };
}

export function compileExternalActContinuity(
  input: ExternalActContinuityInput,
): ExternalActContinuityVerdict {
  const candidate = input.candidate;

  if (input.resolved_head_shas.includes(candidate.head_sha)) {
    return block(
      input,
      "block_resolved_head_replay",
      [`candidate targets already resolved head ${candidate.head_sha}`],
      "discard repaired-head replay and bind the candidate to the live PR head",
    );
  }

  if (candidate.branch !== input.active_branch) {
    return block(
      input,
      "block_wrong_branch",
      [`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`],
      "retarget the candidate to the active external manifestation branch before writing",
    );
  }

  if (candidate.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_wrong_head",
      [`candidate head ${candidate.head_sha} does not match live head ${input.live_head_sha}`],
      "refresh the candidate against the live PR head before writing",
    );
  }

  if (input.exhausted_move_classes.includes(candidate.move_class) || SPENT_STATUS_MOVE_CLASSES.has(candidate.move_class)) {
    return block(
      input,
      "block_spent_move_class",
      [`move class cannot count as progress: ${candidate.move_class}`],
      "choose a non-repeated executable embodiment move class",
    );
  }

  const executableFiles = unique(candidate.changed_files).filter(executablePlatformFile);
  const blockers: string[] = [];

  if (executableFiles.length === 0) blockers.push("candidate changes no executable platform package file");
  if (candidate.behavior_exports.length === 0) blockers.push("candidate exposes no behavior export");
  if (candidate.future_routing_effects.length === 0) blockers.push("candidate has no future-routing effect");

  if (blockers.length > 0) {
    return block(
      input,
      "block_non_executable_candidate",
      blockers,
      "supply an executable platform candidate with a public behavior export and routing effect",
    );
  }

  return {
    ok: true,
    action: "compile_external_act",
    candidate_id: candidate.candidate_id,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    decisive_evidence: unique([
      candidate.move_class,
      ...executableFiles,
      ...candidate.behavior_exports,
      ...candidate.future_routing_effects,
    ]),
    blockers: [],
    write_instruction: "write the admitted executable embodiment, then treat the moved head as requiring fresh status authority",
  };
}
