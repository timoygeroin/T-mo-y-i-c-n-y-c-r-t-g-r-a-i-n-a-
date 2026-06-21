export type CurrentTurnAllowedProgressClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker";

export type CurrentTurnProgressCandidateClass =
  | CurrentTurnAllowedProgressClass
  | "metadata_reread"
  | "duplicate_ci_summary"
  | "duplicate_comment"
  | "duplicate_label"
  | "local_memory_guard"
  | "guessed_future_ci"
  | "reclose_completed_blocker"
  | "old_repaired_head_blocker"
  | "scope_reopen";

export type CurrentTurnProgressInvariantAction =
  | "admit_external_embodiment"
  | "admit_fresh_status_readback"
  | "emit_exact_external_blocker"
  | "block_scope_reopen"
  | "block_non_terminal_bundle"
  | "block_non_progress_class"
  | "block_stale_status_basis"
  | "block_stale_embodiment_base"
  | "block_incomplete_embodiment"
  | "block_missing_exact_blocker";

export interface CurrentTurnProgressCandidate {
  progress_class: CurrentTurnProgressCandidateClass;
  branch: string;
  base_head_sha: string;
  terminal_operations: CurrentTurnAllowedProgressClass[];
  changed_files: string[];
  behavior_exports: string[];
  routing_effects: string[];
  proof_artifacts: string[];
  new_check_run_ids?: string[];
  blocker?: string;
}

export interface CurrentTurnProgressInvariantInput {
  active_branch: string;
  live_head_sha: string;
  last_status_head_sha: string;
  scope_reopened: boolean;
  prohibited_progress_classes: CurrentTurnProgressCandidateClass[];
  candidate: CurrentTurnProgressCandidate;
}

export interface CurrentTurnProgressInvariantVerdict {
  ok: boolean;
  action: CurrentTurnProgressInvariantAction;
  branch: string;
  head_sha: string;
  admitted_progress_class: CurrentTurnAllowedProgressClass | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_CLASSES = new Set<CurrentTurnProgressCandidateClass>([
  "metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "guessed_future_ci",
  "reclose_completed_blocker",
  "old_repaired_head_blocker",
  "scope_reopen",
]);

function behaviorFile(path: string): boolean {
  return (
    path.startsWith("platform/packages/route-governor/src/") &&
    /\.(?:ts|js|mjs)$/.test(path) &&
    !/(?:\.test|-proof)\.ts$/.test(path)
  );
}

function base(input: CurrentTurnProgressInvariantInput): Pick<
  CurrentTurnProgressInvariantVerdict,
  "branch" | "head_sha"
> {
  return {
    branch: input.active_branch,
    head_sha: input.live_head_sha,
  };
}

function block(
  input: CurrentTurnProgressInvariantInput,
  action: Exclude<
    CurrentTurnProgressInvariantAction,
    "admit_external_embodiment" | "admit_fresh_status_readback" | "emit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): CurrentTurnProgressInvariantVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    admitted_progress_class: null,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function embodimentBlockers(candidate: CurrentTurnProgressCandidate): string[] {
  const blockers: string[] = [];

  if (!candidate.changed_files.some(behaviorFile)) {
    blockers.push("external embodiment changes no behavior-bearing route-governor source file");
  }
  if (candidate.behavior_exports.length === 0) {
    blockers.push("external embodiment names no executable behavior export");
  }
  if (candidate.routing_effects.length === 0) {
    blockers.push("external embodiment names no future-routing effect");
  }
  if (candidate.proof_artifacts.length === 0) {
    blockers.push("external embodiment names no proof artifact");
  }

  return blockers;
}

export function enforceCurrentTurnProgressInvariant(
  input: CurrentTurnProgressInvariantInput,
): CurrentTurnProgressInvariantVerdict {
  const candidate = input.candidate;
  const evidence = [`live head ${input.live_head_sha}`, `candidate ${candidate.progress_class}`];

  if (input.scope_reopened || candidate.progress_class === "scope_reopen") {
    return block(
      input,
      "block_scope_reopen",
      ["current turn attempted to reopen scope instead of selecting one terminal progress class"],
      "continue from the existing finalization boundary and choose one allowed progress class",
      evidence,
    );
  }

  if (candidate.branch !== input.active_branch) {
    return block(
      input,
      "block_stale_embodiment_base",
      [`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`],
      "bind the candidate to the active PR branch before release",
      evidence,
    );
  }

  if (NON_PROGRESS_CLASSES.has(candidate.progress_class) || input.prohibited_progress_classes.includes(candidate.progress_class)) {
    return block(
      input,
      "block_non_progress_class",
      [`${candidate.progress_class} cannot count as current-turn progress`],
      "choose a new executable embodiment, a justified fresh status readback, or one exact external blocker",
      evidence,
    );
  }

  if (candidate.terminal_operations.length !== 1 || candidate.terminal_operations[0] !== candidate.progress_class) {
    return block(
      input,
      "block_non_terminal_bundle",
      ["current turn must release exactly one terminal progress class"],
      "split bundled comments, labels, status summaries, and embodiment writes into one admitted terminal operation",
      [...evidence, ...candidate.terminal_operations],
    );
  }

  if (candidate.progress_class === "fresh_status_readback") {
    const headMoved = input.live_head_sha !== input.last_status_head_sha;
    const newChecks = candidate.new_check_run_ids ?? [];

    if (!headMoved && newChecks.length === 0) {
      return block(
        input,
        "block_stale_status_basis",
        ["fresh status readback requires a moved live head or newly surfaced current-head checks"],
        "perform a non-repeated embodiment, wait for new current-head checks, or emit one exact external blocker",
        evidence,
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_fresh_status_readback",
      admitted_progress_class: "fresh_status_readback",
      decisive_evidence: [
        ...evidence,
        ...(headMoved ? [`head moved from ${input.last_status_head_sha} to ${input.live_head_sha}`] : []),
        ...newChecks.map((id) => `new current-head check ${id}`),
      ],
      blockers: [],
      next_route: "read only the live-head status surface; do not reuse repaired-head or summary-only status authority",
    };
  }

  if (candidate.progress_class === "exact_external_blocker") {
    const blocker = candidate.blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_missing_exact_blocker",
        ["exact external blocker progress has no blocker text"],
        "name the exact external blocker or choose an admitted embodiment/readback class",
        evidence,
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_exact_external_blocker",
      admitted_progress_class: "exact_external_blocker",
      decisive_evidence: [...evidence, blocker],
      blockers: [blocker],
      next_route: "remove the named blocker before another current-turn progress class is admitted",
    };
  }

  if (candidate.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_embodiment_base",
      [`candidate base ${candidate.base_head_sha} is not live head ${input.live_head_sha}`],
      "rebase the executable embodiment candidate onto the live PR head before writing",
      evidence,
    );
  }

  const blockers = embodimentBlockers(candidate);
  if (blockers.length > 0) {
    return block(
      input,
      "block_incomplete_embodiment",
      blockers,
      "supply behavior-bearing file, behavior export, future-routing effect, and proof artifact before writing",
      evidence,
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_external_embodiment",
    admitted_progress_class: "external_platform_embodiment",
    decisive_evidence: [
      ...evidence,
      ...candidate.changed_files.filter(behaviorFile),
      ...candidate.behavior_exports,
      ...candidate.routing_effects,
      ...candidate.proof_artifacts,
    ],
    blockers: [],
    next_route: "write this single embodiment, then require status/readback authority for the resulting moved head",
  };
}
