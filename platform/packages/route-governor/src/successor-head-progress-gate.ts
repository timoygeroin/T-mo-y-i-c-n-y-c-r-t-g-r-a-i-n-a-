export type SuccessorHeadProgressClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "repaired_head_status_replay"
  | "duplicate_status_summary"
  | "metadata_reread"
  | "already_closed_blocker_reclose";

export type SuccessorHeadStatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "unknown";

export type SuccessorHeadProgressAction =
  | "admit_successor_embodiment"
  | "admit_successor_status_readback"
  | "emit_successor_exact_blocker"
  | "block_repaired_head_replay"
  | "block_non_progress_class"
  | "block_branch_mismatch"
  | "block_stale_candidate_base"
  | "block_live_status_not_ready"
  | "block_incomplete_embodiment"
  | "block_missing_exact_blocker";

export interface SuccessorHeadCandidate {
  progress_class: SuccessorHeadProgressClass;
  branch: string;
  base_head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  blocker?: string;
}

export interface SuccessorHeadProgressInput {
  active_branch: string;
  live_head_sha: string;
  repaired_head_sha: string;
  repaired_head_status_resolved: boolean;
  last_status_readback_head_sha: string;
  closed_blocker_ids: string[];
  live_status_verdict: SuccessorHeadStatusVerdict;
  candidate: SuccessorHeadCandidate;
}

export interface SuccessorHeadProgressVerdict {
  ok: boolean;
  action: SuccessorHeadProgressAction;
  branch: string;
  head_sha: string;
  successor_head: boolean;
  retired_head_shas: string[];
  retired_blocker_ids: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_CLASSES = new Set<SuccessorHeadProgressClass>([
  "repaired_head_status_replay",
  "duplicate_status_summary",
  "metadata_reread",
  "already_closed_blocker_reclose",
]);

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function proofOnlyPath(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function base(input: SuccessorHeadProgressInput): Pick<
  SuccessorHeadProgressVerdict,
  "branch" | "head_sha" | "successor_head" | "retired_head_shas" | "retired_blocker_ids"
> {
  const retired = new Set<string>();
  if (input.repaired_head_status_resolved && input.repaired_head_sha !== input.live_head_sha) {
    retired.add(input.repaired_head_sha);
  }
  if (input.last_status_readback_head_sha !== input.live_head_sha) {
    retired.add(input.last_status_readback_head_sha);
  }

  return {
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    successor_head: input.live_head_sha !== input.repaired_head_sha,
    retired_head_shas: [...retired],
    retired_blocker_ids: [...input.closed_blocker_ids],
  };
}

function block(
  input: SuccessorHeadProgressInput,
  action: Exclude<
    SuccessorHeadProgressAction,
    "admit_successor_embodiment" | "admit_successor_status_readback" | "emit_successor_exact_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): SuccessorHeadProgressVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function embodimentBlockers(candidate: SuccessorHeadCandidate): string[] {
  const executableChanges = candidate.changed_files.filter(executablePlatformPath);
  const behaviorChanges = executableChanges.filter((path) => !proofOnlyPath(path));
  const blockers: string[] = [];

  if (executableChanges.length === 0) blockers.push("successor-head embodiment changes no executable platform file");
  if (executableChanges.length > 0 && behaviorChanges.length === 0) {
    blockers.push("successor-head embodiment is proof-only and has no behavior file");
  }
  if (candidate.executable_artifacts.length === 0) blockers.push("successor-head embodiment has no executable artifact evidence");
  if (candidate.routing_artifacts.length === 0) blockers.push("successor-head embodiment has no future-routing artifact evidence");
  if (candidate.proof_artifacts.length === 0) blockers.push("successor-head embodiment has no proof artifact evidence");

  return blockers;
}

export function gateSuccessorHeadProgress(input: SuccessorHeadProgressInput): SuccessorHeadProgressVerdict {
  const candidate = input.candidate;

  if (candidate.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`],
      "bind successor-head progress to the active manifestation branch before release",
    );
  }

  if (NON_PROGRESS_CLASSES.has(candidate.progress_class)) {
    const action = candidate.progress_class === "repaired_head_status_replay"
      ? "block_repaired_head_replay"
      : "block_non_progress_class";
    return block(
      input,
      action,
      [`successor-head progress class is non-progress: ${candidate.progress_class}`],
      "choose executable successor embodiment, a live successor-head readback, or one exact blocker",
      [candidate.progress_class, input.repaired_head_sha, ...input.closed_blocker_ids],
    );
  }

  if (candidate.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      candidate.base_head_sha === input.repaired_head_sha ? "block_repaired_head_replay" : "block_stale_candidate_base",
      [`candidate base ${candidate.base_head_sha} is not live head ${input.live_head_sha}`],
      "rebase the candidate to the live successor head; preserve repaired-head evidence only as retired history",
      [`repaired head ${input.repaired_head_sha}`, `last readback head ${input.last_status_readback_head_sha}`],
    );
  }

  if (candidate.progress_class === "fresh_status_readback") {
    if (input.live_head_sha === input.last_status_readback_head_sha) {
      return block(
        input,
        "block_repaired_head_replay",
        ["successor-head status readback requires a head not already consumed by the last status readback"],
        "move the branch with executable embodiment or name a live exact blocker before another readback",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_successor_status_readback",
      decisive_evidence: [`head moved from ${input.last_status_readback_head_sha} to ${input.live_head_sha}`],
      blockers: [],
      next_route: "read only checks and actions bound to the successor live head",
    };
  }

  if (candidate.progress_class === "exact_external_blocker") {
    const blocker = candidate.blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_missing_exact_blocker",
        ["successor-head exact blocker candidate has no blocker text"],
        "name the exact live successor-head blocker or choose executable embodiment",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_successor_exact_blocker",
      decisive_evidence: [blocker, `live successor head ${input.live_head_sha}`],
      blockers: [blocker],
      next_route: "remove the named live successor-head blocker before another progress claim",
    };
  }

  if (input.live_status_verdict !== "passing" && input.live_status_verdict !== "passing_with_warnings") {
    return block(
      input,
      "block_live_status_not_ready",
      [`live successor-head status is ${input.live_status_verdict}`],
      "obtain passing successor-head status or surface the exact live blocker before embodiment",
    );
  }

  const blockers = embodimentBlockers(candidate);
  if (blockers.length > 0) {
    return block(
      input,
      "block_incomplete_embodiment",
      blockers,
      "supply behavior-bearing executable, routing, and proof evidence before moving the successor head",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_successor_embodiment",
    decisive_evidence: [
      `resolved repaired head retired: ${input.repaired_head_sha}`,
      ...input.closed_blocker_ids.map((id) => `closed blocker retired: ${id}`),
      ...candidate.changed_files.filter(executablePlatformPath),
      ...candidate.executable_artifacts,
      ...candidate.routing_artifacts,
      ...candidate.proof_artifacts,
    ],
    blockers: [],
    next_route: "commit the successor-head embodiment, then require status readback only for the moved head",
  };
}
