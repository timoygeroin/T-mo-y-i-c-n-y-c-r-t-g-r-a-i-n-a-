export type PostReadyEmbodimentStatus = "passing" | "passing_with_warnings" | "pending" | "failing" | "no_status_surface";

export type PostReadyEmbodimentMoveClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "duplicate_status_summary"
  | "duplicate_comment"
  | "duplicate_label"
  | "metadata_reread"
  | "reclose_resolved_blocker"
  | "warning_maintenance";

export type PostReadyCapabilityClass =
  | "source_routing"
  | "status_authority"
  | "external_write"
  | "review_handoff"
  | "merge_handoff"
  | "execution_queue"
  | "post_write_status"
  | "post_ready_embodiment";

export type PostReadyEmbodimentAction =
  | "admit_post_ready_embodiment"
  | "admit_moved_head_status_readback"
  | "emit_exact_external_blocker"
  | "block_draft_pr"
  | "block_branch_mismatch"
  | "block_stale_base_head"
  | "block_resolved_head_replay"
  | "block_unresolved_boundary"
  | "block_non_progress_move"
  | "block_live_status_not_ready"
  | "block_spent_increment"
  | "block_repeated_capability_consumer"
  | "block_incomplete_embodiment"
  | "block_missing_exact_blocker";

export interface PostReadyEmbodimentCandidate {
  increment_id: string;
  move_class: PostReadyEmbodimentMoveClass;
  branch: string;
  base_head_sha: string;
  capability_class: PostReadyCapabilityClass;
  future_consumer: string;
  changed_files: string[];
  behavior_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  blocker?: string;
}

export interface SpentPostReadyIncrement {
  increment_id: string;
  capability_class: PostReadyCapabilityClass;
  future_consumer: string;
}

export interface PostReadyEmbodimentSequenceInput {
  active_branch: string;
  live_head_sha: string;
  pr_is_draft: boolean;
  live_status_verdict: PostReadyEmbodimentStatus;
  resolved_boundary_ids: string[];
  resolved_historical_heads: string[];
  last_status_readback_head_sha: string;
  spent_increments: SpentPostReadyIncrement[];
  candidate: PostReadyEmbodimentCandidate;
}

export interface PostReadyEmbodimentSequenceVerdict {
  ok: boolean;
  action: PostReadyEmbodimentAction;
  branch: string;
  head_sha: string;
  increment_id: string | null;
  capability_class: PostReadyCapabilityClass | null;
  future_consumer: string | null;
  decisive_evidence: string[];
  blockers: string[];
  retired_heads: string[];
  next_route: string;
}

const NON_PROGRESS_MOVES = new Set<PostReadyEmbodimentMoveClass>([
  "duplicate_status_summary",
  "duplicate_comment",
  "duplicate_label",
  "metadata_reread",
  "reclose_resolved_blocker",
  "warning_maintenance",
]);

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function behaviorPath(path: string): boolean {
  return (
    executablePlatformPath(path) &&
    path !== "platform/packages/route-governor/package.json" &&
    path !== "platform/packages/route-governor/src/index.ts" &&
    !/(?:\.test|-proof)\.ts$/.test(path)
  );
}

function readyStatus(status: PostReadyEmbodimentStatus): boolean {
  return status === "passing" || status === "passing_with_warnings";
}

function capabilityConsumerKey(value: Pick<SpentPostReadyIncrement, "capability_class" | "future_consumer">): string {
  return `${value.capability_class}::${value.future_consumer.trim().toLowerCase()}`;
}

function base(input: PostReadyEmbodimentSequenceInput): Pick<
  PostReadyEmbodimentSequenceVerdict,
  "branch" | "head_sha" | "increment_id" | "capability_class" | "future_consumer" | "retired_heads"
> {
  const candidate = input.candidate;
  return {
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    increment_id: candidate.increment_id.trim() || null,
    capability_class: candidate.capability_class || null,
    future_consumer: candidate.future_consumer.trim() || null,
    retired_heads: input.resolved_historical_heads.filter((head) => head !== input.live_head_sha),
  };
}

function block(
  input: PostReadyEmbodimentSequenceInput,
  action: Exclude<
    PostReadyEmbodimentAction,
    "admit_post_ready_embodiment" | "admit_moved_head_status_readback" | "emit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): PostReadyEmbodimentSequenceVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function embodimentBlockers(candidate: PostReadyEmbodimentCandidate): string[] {
  const blockers: string[] = [];
  if (!candidate.increment_id.trim()) blockers.push("post-ready embodiment increment has no increment id");
  if (!candidate.future_consumer.trim()) blockers.push("post-ready embodiment has no future consumer");
  if (!candidate.changed_files.some(behaviorPath)) {
    blockers.push("post-ready embodiment changes no behavior-bearing platform file");
  }
  if (candidate.behavior_artifacts.length === 0) blockers.push("post-ready embodiment has no behavior artifact evidence");
  if (candidate.routing_artifacts.length === 0) blockers.push("post-ready embodiment has no future-routing artifact evidence");
  if (candidate.proof_artifacts.length === 0) blockers.push("post-ready embodiment has no proof artifact evidence");
  return blockers;
}

export function sequencePostReadyEmbodiment(
  input: PostReadyEmbodimentSequenceInput,
): PostReadyEmbodimentSequenceVerdict {
  const candidate = input.candidate;

  if (input.pr_is_draft) {
    return block(
      input,
      "block_draft_pr",
      ["PR is draft; post-ready embodiment sequencing is not active"],
      "mark the PR ready for review before using the post-ready embodiment sequencer",
    );
  }

  if (candidate.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`],
      "bind the post-ready embodiment increment to the active manifestation branch",
    );
  }

  if (candidate.base_head_sha !== input.live_head_sha) {
    const action = input.resolved_historical_heads.includes(candidate.base_head_sha)
      ? "block_resolved_head_replay"
      : "block_stale_base_head";
    return block(
      input,
      action,
      [`candidate base ${candidate.base_head_sha} is not live head ${input.live_head_sha}`],
      "rebase the embodiment candidate to the live PR head before moving the branch",
      input.resolved_historical_heads.map((head) => `resolved historical head ${head}`),
    );
  }

  if (input.resolved_historical_heads.includes(input.live_head_sha)) {
    return block(
      input,
      "block_resolved_head_replay",
      [`live head ${input.live_head_sha} is still a resolved historical head`],
      "advance beyond the resolved repaired head before post-ready embodiment sequencing",
    );
  }

  if (input.resolved_boundary_ids.length === 0) {
    return block(
      input,
      "block_unresolved_boundary",
      ["post-ready embodiment sequencing requires at least one resolved boundary id"],
      "record the repaired-head boundary resolution before post-ready embodiment sequencing",
    );
  }

  if (NON_PROGRESS_MOVES.has(candidate.move_class)) {
    return block(
      input,
      "block_non_progress_move",
      [`post-ready move is non-progress: ${candidate.move_class}`],
      "choose a behavior-bearing embodiment, moved-head status readback, or exact external blocker",
      [candidate.move_class],
    );
  }

  if (candidate.move_class === "fresh_status_readback") {
    if (input.live_head_sha === input.last_status_readback_head_sha) {
      return block(
        input,
        "block_non_progress_move",
        ["status readback is not fresh because the live head equals the last status-readback head"],
        "commit a new executable embodiment or name the exact external blocker",
        [`last status readback head ${input.last_status_readback_head_sha}`],
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_moved_head_status_readback",
      decisive_evidence: [`head moved from ${input.last_status_readback_head_sha} to ${input.live_head_sha}`],
      blockers: [],
      next_route: "read checks only for the moved live head before making any status claim",
    };
  }

  if (candidate.move_class === "exact_external_blocker") {
    const blocker = candidate.blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_missing_exact_blocker",
        ["exact external blocker move has no blocker text"],
        "name one exact external blocker or choose a behavior-bearing embodiment",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_exact_external_blocker",
      decisive_evidence: [blocker, `live head ${input.live_head_sha}`],
      blockers: [blocker],
      next_route: "remove the named blocker before attempting post-ready embodiment again",
    };
  }

  if (!readyStatus(input.live_status_verdict)) {
    return block(
      input,
      "block_live_status_not_ready",
      [`live status is ${input.live_status_verdict}`],
      "obtain passing live-head status or emit the exact live blocker before sequencing another embodiment",
    );
  }

  if (input.spent_increments.some((spent) => spent.increment_id === candidate.increment_id)) {
    return block(
      input,
      "block_spent_increment",
      [`post-ready embodiment increment already spent: ${candidate.increment_id}`],
      "choose an unspent increment id with a new capability-consumer pair",
    );
  }

  const candidateKey = capabilityConsumerKey(candidate);
  if (input.spent_increments.some((spent) => capabilityConsumerKey(spent) === candidateKey)) {
    return block(
      input,
      "block_repeated_capability_consumer",
      [`post-ready capability consumer already spent: ${candidateKey}`],
      "choose a materially new capability class or future consumer before moving the branch again",
    );
  }

  const blockers = embodimentBlockers(candidate);
  if (blockers.length > 0) {
    return block(
      input,
      "block_incomplete_embodiment",
      blockers,
      "supply behavior, routing, and proof evidence for the post-ready embodiment increment",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_post_ready_embodiment",
    decisive_evidence: [
      `live head ${input.live_head_sha}`,
      `status ${input.live_status_verdict}`,
      `capability ${candidate.capability_class}`,
      `future consumer ${candidate.future_consumer}`,
      ...input.resolved_boundary_ids.map((id) => `resolved boundary ${id}`),
      ...candidate.changed_files.filter(behaviorPath),
      ...candidate.behavior_artifacts,
      ...candidate.routing_artifacts,
      ...candidate.proof_artifacts,
    ],
    blockers: [],
    next_route: "commit this post-ready embodiment increment, then bind subsequent status authority to the moved resulting head",
  };
}
