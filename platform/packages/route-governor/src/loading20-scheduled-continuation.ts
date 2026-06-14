export type Loading20ContinuationMoveClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "old_repaired_head_blocker"
  | "duplicate_ci_summary"
  | "duplicate_comment"
  | "duplicate_label"
  | "metadata_reread"
  | "local_memory_guard"
  | "guessed_future_ci"
  | "reclose_resolved_blocker";

export type Loading20StatusClaim = "none" | "passing" | "passing_with_warnings" | "pending" | "failing";

export type Loading20ContinuationAction =
  | "admit_live_external_embodiment"
  | "admit_fresh_live_status_readback"
  | "emit_exact_external_blocker"
  | "block_branch_mismatch"
  | "block_historical_head_replay"
  | "block_non_progress_move"
  | "block_stale_status_claim"
  | "block_incomplete_external_embodiment"
  | "block_missing_exact_blocker";

export interface Loading20CheckRunEvidence {
  id: string;
  head_sha: string;
  name: string;
}

export interface Loading20ExecutableIncrement {
  candidate_id: string;
  base_head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
}

export interface Loading20ScheduledContinuationInput {
  branch: string;
  active_branch: string;
  prompt_head_sha: string;
  live_head_sha: string;
  last_repaired_status_head_sha: string;
  requested_move_class: Loading20ContinuationMoveClass;
  status_claim: Loading20StatusClaim;
  status_claim_head_sha?: string;
  new_check_runs: Loading20CheckRunEvidence[];
  increment?: Loading20ExecutableIncrement;
  blocker?: string;
}

export interface Loading20ScheduledContinuationVerdict {
  ok: boolean;
  action: Loading20ContinuationAction;
  branch: string;
  live_head_sha: string;
  quarantined_head_shas: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_CLASSES = new Set<Loading20ContinuationMoveClass>([
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "metadata_reread",
  "local_memory_guard",
  "guessed_future_ci",
  "reclose_resolved_blocker",
]);

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function proofOnlyPath(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function base(input: Loading20ScheduledContinuationInput): Pick<
  Loading20ScheduledContinuationVerdict,
  "branch" | "live_head_sha" | "quarantined_head_shas"
> {
  const quarantined = new Set<string>();
  for (const head of [input.prompt_head_sha, input.last_repaired_status_head_sha, input.status_claim_head_sha]) {
    if (head && head !== input.live_head_sha) quarantined.add(head);
  }
  return {
    branch: input.branch,
    live_head_sha: input.live_head_sha,
    quarantined_head_shas: [...quarantined],
  };
}

function block(
  input: Loading20ScheduledContinuationInput,
  action: Exclude<
    Loading20ContinuationAction,
    "admit_live_external_embodiment" | "admit_fresh_live_status_readback" | "emit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): Loading20ScheduledContinuationVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function currentHeadChecks(input: Loading20ScheduledContinuationInput): Loading20CheckRunEvidence[] {
  return input.new_check_runs.filter((run) => run.head_sha === input.live_head_sha);
}

function incrementBlockers(input: Loading20ScheduledContinuationInput): string[] {
  const increment = input.increment;
  if (!increment) return ["Loading 20 external embodiment has no executable increment"];

  const executableChanges = increment.changed_files.filter(executablePlatformPath);
  const behaviorChanges = executableChanges.filter((path) => !proofOnlyPath(path));
  const blockers: string[] = [];

  if (!increment.candidate_id.trim()) blockers.push("Loading 20 external embodiment has no candidate id");
  if (increment.base_head_sha !== input.live_head_sha) {
    blockers.push(`Loading 20 increment base ${increment.base_head_sha} is not live head ${input.live_head_sha}`);
  }
  if (executableChanges.length === 0) blockers.push("Loading 20 external embodiment changes no executable platform file");
  if (executableChanges.length > 0 && behaviorChanges.length === 0) {
    blockers.push("Loading 20 external embodiment is proof-only and has no behavior file");
  }
  if (increment.executable_artifacts.length === 0) blockers.push("Loading 20 external embodiment has no executable artifact evidence");
  if (increment.routing_artifacts.length === 0) blockers.push("Loading 20 external embodiment has no future-routing artifact evidence");
  if (increment.proof_artifacts.length === 0) blockers.push("Loading 20 external embodiment has no proof artifact evidence");

  return blockers;
}

export function routeLoading20ScheduledContinuation(
  input: Loading20ScheduledContinuationInput,
): Loading20ScheduledContinuationVerdict {
  if (input.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`target branch ${input.branch} does not match active branch ${input.active_branch}`],
      "bind scheduled finalization to the active PR branch before release",
    );
  }

  if (input.requested_move_class === "old_repaired_head_blocker") {
    return block(
      input,
      "block_historical_head_replay",
      [`repaired-head blocker belongs to historical head ${input.last_repaired_status_head_sha}`],
      "do not replay the repaired-head blocker; route from the live PR head",
      [`live head ${input.live_head_sha}`],
    );
  }

  if (NON_PROGRESS_CLASSES.has(input.requested_move_class)) {
    return block(
      input,
      "block_non_progress_move",
      [`non-progress Loading 20 move class: ${input.requested_move_class}`],
      "choose a behavior-bearing embodiment, a legitimate moved-head readback, or one exact blocker",
    );
  }

  if (input.status_claim !== "none" && input.status_claim_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_status_claim",
      [`status claim ${input.status_claim} is bound to ${input.status_claim_head_sha ?? "no head"}, not live head ${input.live_head_sha}`],
      "make no pass/fail claim until a status surface is bound to the live head",
    );
  }

  if (input.requested_move_class === "fresh_status_readback") {
    const movedSinceRepair = input.live_head_sha !== input.last_repaired_status_head_sha;
    const liveChecks = currentHeadChecks(input);
    if (!movedSinceRepair && liveChecks.length === 0) {
      return block(
        input,
        "block_historical_head_replay",
        ["fresh status readback requires a moved live head or new live-head checks"],
        "wait for a moved head/new checks or commit executable embodiment",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_fresh_live_status_readback",
      decisive_evidence: [
        ...(movedSinceRepair ? [`head moved from ${input.last_repaired_status_head_sha} to ${input.live_head_sha}`] : []),
        ...liveChecks.map((run) => `new live-head check ${run.id}: ${run.name}`),
      ],
      blockers: [],
      next_route: "read status only for the live PR head; do not restate repaired-head checks",
    };
  }

  if (input.requested_move_class === "exact_external_blocker") {
    const blocker = input.blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_missing_exact_blocker",
        ["Loading 20 exact blocker move has no blocker text"],
        "name one exact external blocker or commit executable embodiment",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_exact_external_blocker",
      decisive_evidence: [blocker, `live head ${input.live_head_sha}`],
      blockers: [blocker],
      next_route: "remove the named blocker before another Loading 20 finalization move",
    };
  }

  const blockers = incrementBlockers(input);
  if (blockers.length > 0) {
    return block(
      input,
      "block_incomplete_external_embodiment",
      blockers,
      "supply behavior-bearing executable, routing, and proof evidence before moving the branch",
    );
  }

  const increment = input.increment;
  if (!increment) {
    return block(
      input,
      "block_incomplete_external_embodiment",
      ["Loading 20 external embodiment has no executable increment"],
      "supply behavior-bearing executable, routing, and proof evidence before moving the branch",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_live_external_embodiment",
    decisive_evidence: [
      `status claim withheld for live head ${input.live_head_sha}`,
      ...increment.changed_files.filter(executablePlatformPath),
      ...increment.executable_artifacts,
      ...increment.routing_artifacts,
      ...increment.proof_artifacts,
    ],
    blockers: [],
    next_route: "commit the Loading 20 embodiment, then require a new readback bound to the resulting head before any status claim",
  };
}
