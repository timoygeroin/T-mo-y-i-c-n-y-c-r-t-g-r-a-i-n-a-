export type ScheduledTerminalProgressClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "pr_metadata_reread"
  | "duplicate_ci_summary"
  | "duplicate_comment"
  | "duplicate_label"
  | "local_memory_guard"
  | "guessed_future_ci"
  | "reclose_resolved_blocker"
  | "old_repaired_head_blocker";

export type ScheduledTerminalStatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "no_status_surface";

export type ScheduledTerminalProgressAction =
  | "select_external_embodiment"
  | "select_fresh_status_readback"
  | "select_exact_external_blocker"
  | "block_no_terminal_candidate";

export interface ScheduledTerminalCheckRunEvidence {
  id: string;
  head_sha: string;
  name: string;
}

export interface ScheduledTerminalProgressCandidate {
  candidate_id: string;
  progress_class: ScheduledTerminalProgressClass;
  branch: string;
  base_head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  new_check_runs: ScheduledTerminalCheckRunEvidence[];
  blocker?: string;
}

export interface ScheduledTerminalProgressSelectorInput {
  active_branch: string;
  live_head_sha: string;
  previous_status_head_sha: string;
  live_status_verdict: ScheduledTerminalStatusVerdict;
  prohibited_progress_classes: ScheduledTerminalProgressClass[];
  resolved_historical_heads: string[];
  candidates: ScheduledTerminalProgressCandidate[];
}

export interface RejectedScheduledTerminalCandidate {
  candidate_id: string;
  reasons: string[];
}

export interface SelectedScheduledTerminalCandidate {
  candidate_id: string;
  progress_class: Extract<
    ScheduledTerminalProgressClass,
    "external_platform_embodiment" | "fresh_status_readback" | "exact_external_blocker"
  >;
  decisive_evidence: string[];
}

export interface ScheduledTerminalProgressSelectorVerdict {
  ok: boolean;
  action: ScheduledTerminalProgressAction;
  branch: string;
  head_sha: string;
  selected: SelectedScheduledTerminalCandidate | null;
  rejected: RejectedScheduledTerminalCandidate[];
  quarantined_heads: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_CLASSES = new Set<ScheduledTerminalProgressClass>([
  "pr_metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "guessed_future_ci",
  "reclose_resolved_blocker",
  "old_repaired_head_blocker",
]);

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function proofOnlyPath(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function currentHeadCheckRuns(
  input: ScheduledTerminalProgressSelectorInput,
  candidate: ScheduledTerminalProgressCandidate,
): ScheduledTerminalCheckRunEvidence[] {
  return candidate.new_check_runs.filter((run) => run.head_sha === input.live_head_sha);
}

function terminalPriority(candidate: SelectedScheduledTerminalCandidate): number {
  switch (candidate.progress_class) {
    case "external_platform_embodiment":
      return 3;
    case "fresh_status_readback":
      return 2;
    case "exact_external_blocker":
      return 1;
  }
}

function quarantinedHeads(input: ScheduledTerminalProgressSelectorInput): string[] {
  const heads = new Set(input.resolved_historical_heads.filter((head) => head !== input.live_head_sha));
  if (input.previous_status_head_sha !== input.live_head_sha) heads.add(input.previous_status_head_sha);
  for (const candidate of input.candidates) {
    if (candidate.base_head_sha !== input.live_head_sha) heads.add(candidate.base_head_sha);
    for (const run of candidate.new_check_runs) {
      if (run.head_sha !== input.live_head_sha) heads.add(run.head_sha);
    }
  }
  return [...heads];
}

function candidateRejections(
  input: ScheduledTerminalProgressSelectorInput,
  candidate: ScheduledTerminalProgressCandidate,
): string[] {
  const reasons: string[] = [];

  if (!candidate.candidate_id.trim()) reasons.push("candidate has no id");
  if (candidate.branch !== input.active_branch) {
    reasons.push(`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`);
  }
  if (input.prohibited_progress_classes.includes(candidate.progress_class)) {
    reasons.push(`candidate repeats prohibited progress class: ${candidate.progress_class}`);
  }
  if (NON_PROGRESS_CLASSES.has(candidate.progress_class)) {
    reasons.push(`candidate is non-progress class: ${candidate.progress_class}`);
  }

  if (candidate.progress_class === "external_platform_embodiment") {
    const executableChanges = candidate.changed_files.filter(executablePlatformPath);
    const behaviorChanges = executableChanges.filter((path) => !proofOnlyPath(path));

    if (candidate.base_head_sha !== input.live_head_sha) {
      reasons.push(`embodiment base ${candidate.base_head_sha} is not live head ${input.live_head_sha}`);
    }
    if (input.live_status_verdict === "failing" || input.live_status_verdict === "pending") {
      reasons.push(`live status is ${input.live_status_verdict}; embodiment must wait for repair/readback`);
    }
    if (executableChanges.length === 0) reasons.push("embodiment changes no executable platform file");
    if (behaviorChanges.length === 0) reasons.push("embodiment is proof-only and has no behavior file");
    if (candidate.executable_artifacts.length === 0) reasons.push("embodiment has no executable artifact evidence");
    if (candidate.routing_artifacts.length === 0) reasons.push("embodiment has no routing artifact evidence");
    if (candidate.proof_artifacts.length === 0) reasons.push("embodiment has no proof artifact evidence");
  }

  if (candidate.progress_class === "fresh_status_readback") {
    const headMoved = input.live_head_sha !== input.previous_status_head_sha;
    const freshChecks = currentHeadCheckRuns(input, candidate);
    if (!headMoved && freshChecks.length === 0) {
      reasons.push("fresh status readback requires a moved head or new live-head check runs");
    }
    if (candidate.new_check_runs.some((run) => run.head_sha !== input.live_head_sha)) {
      reasons.push("fresh status readback includes stale check runs from a non-live head");
    }
  }

  if (candidate.progress_class === "exact_external_blocker" && !candidate.blocker?.trim()) {
    reasons.push("exact external blocker candidate has no blocker text");
  }

  return reasons;
}

function selectAction(candidate: SelectedScheduledTerminalCandidate): ScheduledTerminalProgressAction {
  if (candidate.progress_class === "external_platform_embodiment") return "select_external_embodiment";
  if (candidate.progress_class === "fresh_status_readback") return "select_fresh_status_readback";
  return "select_exact_external_blocker";
}

function acceptedEvidence(
  input: ScheduledTerminalProgressSelectorInput,
  candidate: ScheduledTerminalProgressCandidate,
): string[] {
  if (candidate.progress_class === "external_platform_embodiment") {
    return [
      `live head ${input.live_head_sha}`,
      ...candidate.changed_files.filter(executablePlatformPath),
      ...candidate.executable_artifacts,
      ...candidate.routing_artifacts,
      ...candidate.proof_artifacts,
    ];
  }

  if (candidate.progress_class === "fresh_status_readback") {
    return [
      ...(input.live_head_sha !== input.previous_status_head_sha
        ? [`head moved from ${input.previous_status_head_sha} to ${input.live_head_sha}`]
        : []),
      ...currentHeadCheckRuns(input, candidate).map((run) => `new live-head check ${run.id}: ${run.name}`),
    ];
  }

  return [candidate.blocker ?? "exact external blocker", `live head ${input.live_head_sha}`];
}

export function selectScheduledTerminalProgress(
  input: ScheduledTerminalProgressSelectorInput,
): ScheduledTerminalProgressSelectorVerdict {
  const rejected: RejectedScheduledTerminalCandidate[] = [];
  const selectable: SelectedScheduledTerminalCandidate[] = [];

  for (const candidate of input.candidates) {
    const reasons = candidateRejections(input, candidate);
    if (reasons.length > 0) {
      rejected.push({ candidate_id: candidate.candidate_id || "<missing>", reasons });
      continue;
    }

    selectable.push({
      candidate_id: candidate.candidate_id,
      progress_class: candidate.progress_class as SelectedScheduledTerminalCandidate["progress_class"],
      decisive_evidence: acceptedEvidence(input, candidate),
    });
  }

  selectable.sort((left, right) => terminalPriority(right) - terminalPriority(left));
  const selected = selectable[0] ?? null;

  if (!selected) {
    return {
      ok: false,
      action: "block_no_terminal_candidate",
      branch: input.active_branch,
      head_sha: input.live_head_sha,
      selected: null,
      rejected,
      quarantined_heads: quarantinedHeads(input),
      blockers: ["no scheduled terminal progress candidate survived selection"],
      next_route: "supply one executable embodiment, one genuinely fresh status readback, or one exact external blocker",
    };
  }

  return {
    ok: true,
    action: selectAction(selected),
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    selected,
    rejected,
    quarantined_heads: quarantinedHeads(input),
    blockers: [],
    next_route:
      selected.progress_class === "external_platform_embodiment"
        ? "commit the selected embodiment and bind the next readback to the moved head"
        : selected.progress_class === "fresh_status_readback"
          ? "publish only the live-head status readback, then choose external embodiment"
          : "publish only the exact external blocker and stop",
  };
}
