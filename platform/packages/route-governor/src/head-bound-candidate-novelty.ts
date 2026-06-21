export type CandidateNoveltyAction =
  | "admit_head_bound_candidate"
  | "block_wrong_head"
  | "block_wrong_branch"
  | "block_spent_artifact_class"
  | "block_spent_candidate_signature"
  | "block_spent_move_class"
  | "block_incomplete_candidate";

export interface HeadBoundCandidateNoveltyInput {
  active_branch: string;
  live_head_sha: string;
  candidate_id: string;
  candidate_branch: string;
  candidate_head_sha: string;
  artifact_class: string;
  move_class: string;
  candidate_signature?: string;
  spent_candidate_signatures?: string[];
  spent_artifact_classes: string[];
  spent_move_classes: string[];
  changed_files: string[];
  executable_behavior_exports: string[];
  future_routing_effects: string[];
}

export interface HeadBoundCandidateNoveltyVerdict {
  ok: boolean;
  action: CandidateNoveltyAction;
  candidate_id: string;
  branch: string;
  head_sha: string;
  admitted_artifact_class: string | null;
  admitted_candidate_signature: string | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_MOVE_CLASSES = new Set([
  "metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "guessed_future_ci",
  "reclose_completed_blocker",
  "old_repaired_head_blocker",
]);

function executablePlatformFile(path: string): boolean {
  return path.startsWith("platform/packages/") && (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs"));
}

function normalizeSignature(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function incompleteBlockers(input: HeadBoundCandidateNoveltyInput): string[] {
  const blockers: string[] = [];

  if (!input.candidate_id.trim()) blockers.push("candidate has no id");
  if (!input.artifact_class.trim()) blockers.push("candidate has no artifact class");
  if (!input.move_class.trim()) blockers.push("candidate has no move class");
  if (!input.changed_files.some(executablePlatformFile)) {
    blockers.push("candidate changes no executable platform package file");
  }
  if (input.executable_behavior_exports.length === 0) {
    blockers.push("candidate exposes no executable behavior export");
  }
  if (input.future_routing_effects.length === 0) {
    blockers.push("candidate has no future-routing effect");
  }

  return blockers;
}

function blockedVerdict(
  input: HeadBoundCandidateNoveltyInput,
  action: Exclude<CandidateNoveltyAction, "admit_head_bound_candidate">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): HeadBoundCandidateNoveltyVerdict {
  return {
    candidate_id: input.candidate_id,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    ok: false,
    action,
    admitted_artifact_class: null,
    admitted_candidate_signature: null,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

export function admitHeadBoundCandidateNovelty(
  input: HeadBoundCandidateNoveltyInput,
): HeadBoundCandidateNoveltyVerdict {
  const candidateSignature = normalizeSignature(input.candidate_signature);

  if (input.candidate_branch !== input.active_branch) {
    return blockedVerdict(
      input,
      "block_wrong_branch",
      [`candidate branch ${input.candidate_branch} does not match active branch ${input.active_branch}`],
      "bind the next embodiment candidate to the active PR branch before writing",
    );
  }

  if (input.candidate_head_sha !== input.live_head_sha) {
    return blockedVerdict(
      input,
      "block_wrong_head",
      [`candidate head ${input.candidate_head_sha} does not match live head ${input.live_head_sha}`],
      "refresh the candidate against the current PR head before attempting a write",
    );
  }

  if (candidateSignature && (input.spent_candidate_signatures ?? []).includes(candidateSignature)) {
    return blockedVerdict(
      input,
      "block_spent_candidate_signature",
      [`candidate signature already spent: ${candidateSignature}`],
      "choose a semantically new embodiment candidate instead of relabeling a spent route",
      [candidateSignature],
    );
  }

  if (input.spent_artifact_classes.includes(input.artifact_class)) {
    return blockedVerdict(
      input,
      "block_spent_artifact_class",
      [`artifact class already spent: ${input.artifact_class}`],
      "choose a candidate whose artifact class has not already been used as progress",
    );
  }

  if (input.spent_move_classes.includes(input.move_class) || NON_PROGRESS_MOVE_CLASSES.has(input.move_class)) {
    return blockedVerdict(
      input,
      "block_spent_move_class",
      [`move class cannot count as progress: ${input.move_class}`],
      "choose a new executable embodiment move class instead of replaying an exhausted route",
    );
  }

  const blockers = incompleteBlockers(input);
  if (blockers.length > 0) {
    return blockedVerdict(
      input,
      "block_incomplete_candidate",
      blockers,
      "supply executable platform files, exported behavior, and future-routing effect before writing",
    );
  }

  return {
    candidate_id: input.candidate_id,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    ok: true,
    action: "admit_head_bound_candidate",
    admitted_artifact_class: input.artifact_class,
    admitted_candidate_signature: candidateSignature,
    decisive_evidence: [
      input.artifact_class,
      input.move_class,
      ...(candidateSignature ? [candidateSignature] : []),
      ...input.changed_files.filter(executablePlatformFile),
      ...input.executable_behavior_exports,
      ...input.future_routing_effects,
    ],
    blockers: [],
    next_route: "write the admitted candidate, then treat the resulting moved head as requiring its own status authority",
  };
}
