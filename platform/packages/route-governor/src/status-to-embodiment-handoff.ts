export type StatusToEmbodimentHandoffAction =
  | "require_next_embodiment"
  | "accept_next_embodiment"
  | "block_status_replay"
  | "block_incomplete_embodiment"
  | "block_head_mismatch";

export type PostStatusMoveClass =
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

export interface StatusToEmbodimentHandoffInput {
  branch: string;
  active_branch: string;
  status_head_sha: string;
  live_head_sha: string;
  status_verdict: "passing" | "passing_with_warnings";
  next_move_class: PostStatusMoveClass;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  artifact_class: string;
  spent_artifact_classes: string[];
}

export interface StatusToEmbodimentHandoffVerdict {
  ok: boolean;
  action: StatusToEmbodimentHandoffAction;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const STATUS_REPLAY_CLASSES = new Set<PostStatusMoveClass>([
  "fresh_status_readback",
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
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function base(input: StatusToEmbodimentHandoffInput): Pick<
  StatusToEmbodimentHandoffVerdict,
  "branch" | "head_sha"
> {
  return { branch: input.branch, head_sha: input.live_head_sha };
}

function embodimentBlockers(input: StatusToEmbodimentHandoffInput): string[] {
  const blockers: string[] = [];

  if (!input.changed_files.some(executablePlatformPath)) {
    blockers.push("post-status embodiment does not change executable platform files");
  }
  if (input.executable_artifacts.length === 0) {
    blockers.push("post-status embodiment has no executable artifact evidence");
  }
  if (input.routing_artifacts.length === 0) {
    blockers.push("post-status embodiment has no future-routing artifact evidence");
  }
  if (input.proof_artifacts.length === 0) {
    blockers.push("post-status embodiment has no proof artifact evidence");
  }
  if (!input.artifact_class.trim()) {
    blockers.push("post-status embodiment has no artifact class");
  }
  if (input.spent_artifact_classes.includes(input.artifact_class)) {
    blockers.push(`post-status embodiment repeats spent artifact class: ${input.artifact_class}`);
  }

  return blockers;
}

export function compileStatusToEmbodimentHandoff(
  input: StatusToEmbodimentHandoffInput,
): StatusToEmbodimentHandoffVerdict {
  const baseFields = base(input);

  if (input.branch !== input.active_branch) {
    return {
      ...baseFields,
      ok: false,
      action: "block_head_mismatch",
      decisive_evidence: [],
      blockers: [`post-status branch ${input.branch} does not match active branch ${input.active_branch}`],
      next_route: "bind the post-status handoff to the active PR branch before choosing the next move",
    };
  }

  if (input.status_head_sha !== input.live_head_sha) {
    return {
      ...baseFields,
      ok: false,
      action: "block_head_mismatch",
      decisive_evidence: [],
      blockers: [`passing status belongs to ${input.status_head_sha}, not live head ${input.live_head_sha}`],
      next_route: "discard the stale passing status and read the live PR head before handoff",
    };
  }

  if (STATUS_REPLAY_CLASSES.has(input.next_move_class)) {
    return {
      ...baseFields,
      ok: false,
      action: "block_status_replay",
      decisive_evidence: [`status for ${input.live_head_sha} is already ${input.status_verdict}`],
      blockers: [`post-status move repeats non-progress class: ${input.next_move_class}`],
      next_route: "choose a new executable embodiment class or name one exact live-head blocker",
    };
  }

  if (input.next_move_class === "exact_external_blocker") {
    return {
      ...baseFields,
      ok: false,
      action: "require_next_embodiment",
      decisive_evidence: [`status for ${input.live_head_sha} is ${input.status_verdict}`],
      blockers: ["post-status handoff has no exact blocker text surface"],
      next_route: "provide the exact live-head blocker or choose a new executable embodiment",
    };
  }

  const blockers = embodimentBlockers(input);
  if (blockers.length > 0) {
    return {
      ...baseFields,
      ok: false,
      action: "block_incomplete_embodiment",
      decisive_evidence: [`status for ${input.live_head_sha} is ${input.status_verdict}`],
      blockers,
      next_route: "raise the next move to executable files, routing evidence, proof evidence, and a new artifact class",
    };
  }

  return {
    ...baseFields,
    ok: true,
    action: "accept_next_embodiment",
    decisive_evidence: [
      `status for ${input.live_head_sha} is ${input.status_verdict}`,
      input.artifact_class,
      ...input.changed_files.filter(executablePlatformPath),
      ...input.executable_artifacts,
      ...input.routing_artifacts,
      ...input.proof_artifacts,
    ],
    blockers: [],
    next_route: "commit the non-repeated executable embodiment, then open a new-head status cursor",
  };
}
