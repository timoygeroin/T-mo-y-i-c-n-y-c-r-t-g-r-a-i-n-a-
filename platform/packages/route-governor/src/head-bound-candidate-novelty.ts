export type CandidateNoveltyAction =
  | "admit_head_bound_candidate"
  | "block_wrong_head"
  | "block_wrong_branch"
  | "block_spent_artifact_class"
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

export function admitHeadBoundCandidateNovelty(
  input: HeadBoundCandidateNoveltyInput,
): HeadBoundCandidateNoveltyVerdict {
  const base = {
    candidate_id: input.candidate_id,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
  };

  if (input.candidate_branch !== input.active_branch) {
    return {
      ...base,
      ok: false,
      action: "block_wrong_branch",
      admitted_artifact_class: null,
      decisive_evidence: [],
      blockers: [`candidate branch ${input.candidate_branch} does not match active branch ${input.active_branch}`],
      next_route: "bind the next embodiment candidate to the active PR branch before writing",
    };
  }

  if (input.candidate_head_sha !== input.live_head_sha) {
    return {
      ...base,
      ok: false,
      action: "block_wrong_head",
      admitted_artifact_class: null,
      decisive_evidence: [],
      blockers: [`candidate head ${input.candidate_head_sha} does not match live head ${input.live_head_sha}`],
      next_route: "refresh the candidate against the current PR head before attempting a write",
    };
  }

  if (input.spent_artifact_classes.includes(input.artifact_class)) {
    return {
      ...base,
      ok: false,
      action: "block_spent_artifact_class",
      admitted_artifact_class: null,
      decisive_evidence: [],
      blockers: [`artifact class already spent: ${input.artifact_class}`],
      next_route: "choose a candidate whose artifact class has not already been used as progress",
    };
  }

  if (input.spent_move_classes.includes(input.move_class) || NON_PROGRESS_MOVE_CLASSES.has(input.move_class)) {
    return {
      ...base,
      ok: false,
      action: "block_spent_move_class",
      admitted_artifact_class: null,
      decisive_evidence: [],
      blockers: [`move class cannot count as progress: ${input.move_class}`],
      next_route: "choose a new executable embodiment move class instead of replaying an exhausted route",
    };
  }

  const blockers = incompleteBlockers(input);
  if (blockers.length > 0) {
    return {
      ...base,
      ok: false,
      action: "block_incomplete_candidate",
      admitted_artifact_class: null,
      decisive_evidence: [],
      blockers,
      next_route: "supply executable platform files, exported behavior, and future-routing effect before writing",
    };
  }

  return {
    ...base,
    ok: true,
    action: "admit_head_bound_candidate",
    admitted_artifact_class: input.artifact_class,
    decisive_evidence: [
      input.artifact_class,
      input.move_class,
      ...input.changed_files.filter(executablePlatformFile),
      ...input.executable_behavior_exports,
      ...input.future_routing_effects,
    ],
    blockers: [],
    next_route: "write the admitted candidate, then treat the resulting moved head as requiring its own status authority",
  };
}
