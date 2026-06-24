export type PostStatusVerdict = "passing" | "passing_with_warnings";

export type PostStatusAuthorityAction =
  | "accept_live_status_evidence"
  | "hold_for_live_status"
  | "repair_live_failure"
  | "block_stale_status_evidence"
  | "block_summary_as_status";

export type PostStatusMoveClass =
  | "external_platform_embodiment"
  | "warning_maintenance"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "duplicate_ci_summary"
  | "metadata_reread";

export type PostStatusQueueAction =
  | "queue_external_embodiment"
  | "block_status_not_authoritative"
  | "block_non_progress_move"
  | "block_warning_priority"
  | "block_repeated_artifact"
  | "block_incomplete_candidate";

export interface PostStatusEmbodimentCandidate {
  candidate_id: string;
  move_class: PostStatusMoveClass;
  artifact_class: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  capability_axis: "runtime_execution" | "external_write" | "proof_surface" | "source_routing" | "status_readback";
}

export interface PostStatusEmbodimentQueueInput {
  branch: string;
  active_branch: string;
  live_head_sha: string;
  status_head_sha: string;
  status_verdict: PostStatusVerdict | "pending" | "failing" | "unknown";
  status_authority_action: PostStatusAuthorityAction;
  non_blocking_warnings: string[];
  spent_move_classes: string[];
  spent_artifact_classes: string[];
  candidate?: PostStatusEmbodimentCandidate;
}

export interface QueuedPostStatusEmbodiment {
  candidate_id: string;
  artifact_class: string;
  capability_axis: PostStatusEmbodimentCandidate["capability_axis"];
  required_status_head_after_commit: "new_head";
  decisive_evidence: string[];
}

export interface PostStatusEmbodimentQueueVerdict {
  ok: boolean;
  action: PostStatusQueueAction;
  branch: string;
  head_sha: string;
  queued: QueuedPostStatusEmbodiment | null;
  blockers: string[];
  warnings: string[];
  next_route: string;
}

const NON_PROGRESS_MOVE_CLASSES = new Set<PostStatusMoveClass>([
  "fresh_status_readback",
  "exact_external_blocker",
  "duplicate_ci_summary",
  "metadata_reread",
]);

function executablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function base(input: PostStatusEmbodimentQueueInput): Pick<PostStatusEmbodimentQueueVerdict, "branch" | "head_sha" | "warnings"> {
  return { branch: input.branch, head_sha: input.live_head_sha, warnings: input.non_blocking_warnings };
}

function block(
  input: PostStatusEmbodimentQueueInput,
  action: Exclude<PostStatusQueueAction, "queue_external_embodiment">,
  blockers: string[],
  nextRoute: string,
): PostStatusEmbodimentQueueVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    queued: null,
    blockers,
    next_route: nextRoute,
  };
}

function candidateBlockers(input: PostStatusEmbodimentQueueInput): string[] {
  const candidate = input.candidate;
  if (!candidate) return ["post-status queue has no embodiment candidate"];

  const blockers: string[] = [];
  if (!candidate.candidate_id.trim()) blockers.push("candidate has no id");
  if (!candidate.artifact_class.trim()) blockers.push("candidate has no artifact class");
  if (input.spent_artifact_classes.includes(candidate.artifact_class)) {
    blockers.push(`candidate artifact class is already spent: ${candidate.artifact_class}`);
  }
  if (input.spent_move_classes.includes(candidate.move_class)) {
    blockers.push(`candidate move class is already spent: ${candidate.move_class}`);
  }
  if (!candidate.changed_files.some(executablePlatformPath)) {
    blockers.push("candidate does not change executable platform files");
  }
  if (candidate.executable_artifacts.length === 0) blockers.push("candidate has no executable artifact evidence");
  if (candidate.routing_artifacts.length === 0) blockers.push("candidate has no future-routing artifact evidence");
  if (candidate.proof_artifacts.length === 0) blockers.push("candidate has no proof artifact evidence");

  return blockers;
}

export function queuePostStatusEmbodiment(
  input: PostStatusEmbodimentQueueInput,
): PostStatusEmbodimentQueueVerdict {
  if (input.branch !== input.active_branch) {
    return block(
      input,
      "block_status_not_authoritative",
      [`post-status queue branch ${input.branch} does not match active branch ${input.active_branch}`],
      "bind the queue to the active PR branch before selecting embodiment work",
    );
  }

  if (input.status_authority_action !== "accept_live_status_evidence") {
    return block(
      input,
      "block_status_not_authoritative",
      [`status authority did not accept live evidence: ${input.status_authority_action}`],
      "obtain accepted live-head status evidence before queuing post-status embodiment",
    );
  }

  if (input.status_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_status_not_authoritative",
      [`status evidence belongs to ${input.status_head_sha}, not live head ${input.live_head_sha}`],
      "discard stale status and read the live head before queuing embodiment",
    );
  }

  if (input.status_verdict !== "passing" && input.status_verdict !== "passing_with_warnings") {
    return block(
      input,
      "block_status_not_authoritative",
      [`live-head status is ${input.status_verdict}`],
      "repair, wait, or obtain stronger status evidence before queuing embodiment",
    );
  }

  const candidate = input.candidate;
  if (candidate && NON_PROGRESS_MOVE_CLASSES.has(candidate.move_class)) {
    return block(
      input,
      "block_non_progress_move",
      [`candidate repeats non-progress move class: ${candidate.move_class}`],
      "choose a new executable embodiment candidate, not a status/comment/blocker substitute",
    );
  }

  if (candidate?.move_class === "warning_maintenance") {
    return block(
      input,
      "block_warning_priority",
      input.non_blocking_warnings.length > 0
        ? input.non_blocking_warnings.map((warning) => `warning remains deferred below embodiment: ${warning}`)
        : ["warning maintenance cannot be first post-status embodiment work"],
      "queue external platform embodiment before warning maintenance unless a warning becomes a blocking failure",
    );
  }

  const blockers = candidateBlockers(input);
  if (blockers.some((candidateBlocker) => candidateBlocker.includes("already spent"))) {
    return block(input, "block_repeated_artifact", blockers, "select an unspent move and artifact class");
  }

  if (blockers.length > 0) {
    return block(
      input,
      "block_incomplete_candidate",
      blockers,
      "supply executable, routed, and proof-backed embodiment evidence before queueing",
    );
  }

  if (!candidate) {
    return block(
      input,
      "block_incomplete_candidate",
      ["post-status queue has no embodiment candidate"],
      "supply executable, routed, and proof-backed embodiment evidence before queueing",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "queue_external_embodiment",
    queued: {
      candidate_id: candidate.candidate_id,
      artifact_class: candidate.artifact_class,
      capability_axis: candidate.capability_axis,
      required_status_head_after_commit: "new_head",
      decisive_evidence: [
        `status ${input.status_verdict} for ${input.live_head_sha}`,
        candidate.move_class,
        candidate.artifact_class,
        candidate.capability_axis,
        ...candidate.changed_files.filter(executablePlatformPath),
        ...candidate.executable_artifacts,
        ...candidate.routing_artifacts,
        ...candidate.proof_artifacts,
      ],
    },
    blockers: [],
    next_route: "commit the queued embodiment, then require a fresh status readback for the resulting new head",
  };
}
