export type LiveBlockerRetirementStatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "no_status_surface";

export type LiveBlockerRetirementMoveClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "duplicate_status_summary"
  | "stale_blocker_replay";

export type LiveBlockerRetirementAction =
  | "retire_stale_blocker_and_read_live_status"
  | "hold_live_blocker"
  | "admit_external_embodiment"
  | "require_live_status"
  | "block_duplicate_summary"
  | "block_incomplete_embodiment";

export interface LiveExternalBlocker {
  blocker_id: string;
  head_sha: string;
  blocker_text: string;
  required_surface: string;
}

export interface LiveBlockerEmbodimentCandidate {
  candidate_id: string;
  artifact_class: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  spent_artifact_classes: string[];
}

export interface LiveBlockerRetirementInput {
  branch: string;
  active_branch: string;
  live_head_sha: string;
  last_readback_head_sha: string;
  status_verdict: LiveBlockerRetirementStatusVerdict;
  requested_move_class: LiveBlockerRetirementMoveClass;
  blocker?: LiveExternalBlocker;
  candidate?: LiveBlockerEmbodimentCandidate;
}

export interface LiveBlockerRetirementVerdict {
  ok: boolean;
  action: LiveBlockerRetirementAction;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  retired_blocker_ids: string[];
  next_route: string;
}

const DUPLICATE_MOVES = new Set<LiveBlockerRetirementMoveClass>(["duplicate_status_summary", "stale_blocker_replay"]);

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function proofOnlyPath(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function base(input: LiveBlockerRetirementInput): Pick<LiveBlockerRetirementVerdict, "branch" | "head_sha"> {
  return { branch: input.branch, head_sha: input.live_head_sha };
}

function block(
  input: LiveBlockerRetirementInput,
  action: Exclude<LiveBlockerRetirementAction, "retire_stale_blocker_and_read_live_status" | "admit_external_embodiment">,
  blockers: string[],
  nextRoute: string,
  decisiveEvidence: string[] = [],
): LiveBlockerRetirementVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: decisiveEvidence,
    blockers,
    retired_blocker_ids: [],
    next_route: nextRoute,
  };
}

function candidateBlockers(candidate: LiveBlockerEmbodimentCandidate | undefined): string[] {
  if (!candidate) return ["external embodiment route has no candidate"];

  const executableChanges = candidate.changed_files.filter(executablePlatformPath);
  const behaviorChanges = executableChanges.filter((path) => !proofOnlyPath(path));
  const blockers: string[] = [];

  if (!candidate.candidate_id.trim()) blockers.push("external embodiment candidate has no candidate id");
  if (!candidate.artifact_class.trim()) blockers.push("external embodiment candidate has no artifact class");
  if (candidate.spent_artifact_classes.includes(candidate.artifact_class)) {
    blockers.push(`artifact class already spent: ${candidate.artifact_class}`);
  }
  if (executableChanges.length === 0) blockers.push("external embodiment candidate changes no executable platform files");
  if (executableChanges.length > 0 && behaviorChanges.length === 0) {
    blockers.push("external embodiment candidate is proof-only and has no behavior file");
  }
  if (candidate.executable_artifacts.length === 0) blockers.push("external embodiment candidate has no executable artifact");
  if (candidate.routing_artifacts.length === 0) blockers.push("external embodiment candidate has no future-routing artifact");
  if (candidate.proof_artifacts.length === 0) blockers.push("external embodiment candidate has no proof artifact");

  return blockers;
}

export function routeLiveBlockerRetirement(input: LiveBlockerRetirementInput): LiveBlockerRetirementVerdict {
  if (input.branch !== input.active_branch) {
    return block(
      input,
      "require_live_status",
      [`live blocker route branch ${input.branch} does not match active branch ${input.active_branch}`],
      "bind blocker retirement to the active PR branch before release",
    );
  }

  if (DUPLICATE_MOVES.has(input.requested_move_class)) {
    return block(
      input,
      "block_duplicate_summary",
      [`requested move class is non-progress: ${input.requested_move_class}`],
      "choose live-head status readback, non-repeated embodiment, or exact blocker",
    );
  }

  const headMovedSinceReadback = input.live_head_sha !== input.last_readback_head_sha;
  const blocker = input.blocker;

  if (blocker && blocker.head_sha !== input.live_head_sha) {
    if (!headMovedSinceReadback && input.requested_move_class !== "fresh_status_readback") {
      return block(
        input,
        "require_live_status",
        [`blocker ${blocker.blocker_id} is stale but no moved-head readback route was requested`],
        "read the live head before retiring stale blocker evidence",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "retire_stale_blocker_and_read_live_status",
      decisive_evidence: [
        `${blocker.blocker_id} belongs to ${blocker.head_sha}`,
        `live head is ${input.live_head_sha}`,
        `last readback head was ${input.last_readback_head_sha}`,
      ],
      blockers: [],
      retired_blocker_ids: [blocker.blocker_id],
      next_route: "discard the stale blocker and read only the live-head status surface before a pass/fail claim",
    };
  }

  if (blocker && blocker.head_sha === input.live_head_sha) {
    return block(
      input,
      "hold_live_blocker",
      [blocker.blocker_text],
      "remove the live-head blocker by surfacing the required evidence before choosing another progress class",
      [`${blocker.blocker_id} is bound to live head ${input.live_head_sha}`, blocker.required_surface],
    );
  }

  if (input.status_verdict === "no_status_surface" && input.requested_move_class === "fresh_status_readback") {
    return block(
      input,
      "require_live_status",
      [`no live-head status surface is attached for ${input.live_head_sha}`],
      "obtain a check-run, workflow-run, combined-status, or issue-published readback surface for the live head",
    );
  }

  if (input.status_verdict === "pending") {
    return block(
      input,
      "require_live_status",
      [`live-head status is pending for ${input.live_head_sha}`],
      "wait for live-head checks before making a pass/fail claim or retiring the status route",
    );
  }

  if (input.status_verdict === "failing") {
    return block(
      input,
      "hold_live_blocker",
      [`live-head status is failing for ${input.live_head_sha}`],
      "surface the concrete failure log and repair only the live-head failure",
    );
  }

  if (input.requested_move_class !== "external_platform_embodiment") {
    return block(
      input,
      "block_duplicate_summary",
      [`requested move class cannot advance without a blocker or embodiment: ${input.requested_move_class}`],
      "choose a non-repeated executable embodiment increment or emit one exact external blocker",
    );
  }

  const blockers = candidateBlockers(input.candidate);
  if (blockers.length > 0) {
    return block(
      input,
      "block_incomplete_embodiment",
      blockers,
      "supply a behavior-bearing executable embodiment candidate before release",
    );
  }

  const candidate = input.candidate;
  if (!candidate) {
    return block(input, "block_incomplete_embodiment", ["external embodiment route has no candidate"], "supply a candidate");
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_external_embodiment",
    decisive_evidence: [
      candidate.candidate_id,
      candidate.artifact_class,
      ...candidate.changed_files.filter(executablePlatformPath),
      ...candidate.executable_artifacts,
      ...candidate.routing_artifacts,
      ...candidate.proof_artifacts,
    ],
    blockers: [],
    retired_blocker_ids: [],
    next_route: "commit the embodiment increment, then require status readback for the moved live head",
  };
}
