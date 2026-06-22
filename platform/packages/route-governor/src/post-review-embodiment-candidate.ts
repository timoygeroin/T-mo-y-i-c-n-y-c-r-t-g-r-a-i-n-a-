export type PostReviewDeltaKind = "changes_requested" | "actionable_comment" | "approval" | "pending" | "dismissed";

export type PostReviewEmbodimentNextAction =
  | "external_platform_embodiment"
  | "exact_external_blocker"
  | "fresh_status_readback"
  | "metadata_reread"
  | "duplicate_comment"
  | "duplicate_status_summary"
  | "local_memory_guard"
  | "warning_maintenance";

export type PostReviewEmbodimentCandidateAction =
  | "admit_post_review_embodiment"
  | "emit_exact_review_blocker"
  | "block_reused_route"
  | "block_branch_mismatch"
  | "block_head_mismatch"
  | "block_non_progress_action"
  | "block_non_actionable_review_delta"
  | "block_unbounded_review_delta"
  | "block_unbound_candidate_files"
  | "block_spent_candidate_signature"
  | "block_incomplete_candidate"
  | "block_missing_exact_blocker";

export interface PostReviewDeltaSurface {
  delta_id: string;
  branch: string;
  head_sha: string;
  kind: PostReviewDeltaKind;
  file_paths: string[];
  reviewer?: string;
  evidence: string[];
}

export interface PostReviewEmbodimentCandidate {
  candidate_id: string;
  branch: string;
  base_head_sha: string;
  candidate_signature: string;
  changed_files: string[];
  behavior_exports: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
}

export interface PostReviewEmbodimentCandidateInput {
  active_branch: string;
  live_head_sha: string;
  route_id: string;
  spent_route_ids: string[];
  spent_candidate_signatures: string[];
  requested_next_action: PostReviewEmbodimentNextAction;
  review_delta: PostReviewDeltaSurface;
  candidate?: PostReviewEmbodimentCandidate;
  exact_blocker?: string;
}

export interface PostReviewEmbodimentCandidateVerdict {
  ok: boolean;
  action: PostReviewEmbodimentCandidateAction;
  route_id: string | null;
  branch: string;
  head_sha: string;
  admitted_candidate_signature: string | null;
  required_status_head_sha: string | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_ACTIONS = new Set<PostReviewEmbodimentNextAction>([
  "metadata_reread",
  "duplicate_comment",
  "duplicate_status_summary",
  "local_memory_guard",
  "warning_maintenance",
]);

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

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

function base(input: PostReviewEmbodimentCandidateInput): Pick<
  PostReviewEmbodimentCandidateVerdict,
  "route_id" | "branch" | "head_sha"
> {
  return {
    route_id: input.route_id.trim() || null,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
  };
}

function routeEvidence(input: PostReviewEmbodimentCandidateInput): string[] {
  return [
    `route ${input.route_id.trim() || "<missing>"}`,
    `delta ${input.review_delta.delta_id.trim() || "<missing>"}`,
    `kind ${input.review_delta.kind}`,
    `live head ${input.live_head_sha}`,
    ...input.review_delta.file_paths,
    ...input.review_delta.evidence,
  ];
}

function block(
  input: PostReviewEmbodimentCandidateInput,
  action: Exclude<PostReviewEmbodimentCandidateAction, "admit_post_review_embodiment" | "emit_exact_review_blocker">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): PostReviewEmbodimentCandidateVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    admitted_candidate_signature: null,
    required_status_head_sha: null,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function candidateBlockers(input: PostReviewEmbodimentCandidateInput): string[] {
  const candidate = input.candidate;
  const blockers: string[] = [];

  if (!candidate) return ["post-review embodiment has no candidate receipt"];
  if (!candidate.changed_files.some(behaviorPath)) blockers.push("candidate changes no behavior-bearing platform file");
  if (candidate.behavior_exports.length === 0) blockers.push("candidate exposes no behavior export");
  if (candidate.routing_artifacts.length === 0) blockers.push("candidate has no future-routing artifact");
  if (candidate.proof_artifacts.length === 0) blockers.push("candidate has no proof artifact");

  return blockers;
}

export function admitPostReviewEmbodimentCandidate(
  input: PostReviewEmbodimentCandidateInput,
): PostReviewEmbodimentCandidateVerdict {
  const routeId = input.route_id.trim();
  const evidence = routeEvidence(input);

  if (!routeId || input.spent_route_ids.includes(routeId)) {
    return block(
      input,
      "block_reused_route",
      [routeId ? `post-review route already spent: ${routeId}` : "post-review route has no id"],
      "issue a fresh route id before consuming review feedback as progress",
      evidence,
    );
  }

  if (input.review_delta.branch !== input.active_branch || input.candidate?.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [
        ...(input.review_delta.branch !== input.active_branch
          ? [`review delta branch ${input.review_delta.branch} is not ${input.active_branch}`]
          : []),
        ...(input.candidate && input.candidate.branch !== input.active_branch
          ? [`candidate branch ${input.candidate.branch} is not ${input.active_branch}`]
          : []),
      ],
      "bind post-review embodiment routing to the active PR branch",
      evidence,
    );
  }

  if (input.review_delta.head_sha !== input.live_head_sha || input.candidate?.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_head_mismatch",
      [
        ...(input.review_delta.head_sha !== input.live_head_sha
          ? [`review delta head ${input.review_delta.head_sha} is not live head ${input.live_head_sha}`]
          : []),
        ...(input.candidate && input.candidate.base_head_sha !== input.live_head_sha
          ? [`candidate base ${input.candidate.base_head_sha} is not live head ${input.live_head_sha}`]
          : []),
      ],
      "refresh review feedback and candidate base to the live PR head before writing",
      evidence,
    );
  }

  if (NON_PROGRESS_ACTIONS.has(input.requested_next_action)) {
    return block(
      input,
      "block_non_progress_action",
      [`${input.requested_next_action} cannot consume review feedback as progress`],
      "choose a file-bound executable embodiment, exact review blocker, or fresh status readback when allowed",
      [...evidence, input.requested_next_action],
    );
  }

  if (input.requested_next_action === "exact_external_blocker") {
    const blocker = input.exact_blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_missing_exact_blocker",
        ["exact review blocker action has no blocker text"],
        "name the exact external review blocker or provide an executable candidate",
        evidence,
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_exact_review_blocker",
      admitted_candidate_signature: null,
      required_status_head_sha: null,
      decisive_evidence: [...evidence, blocker],
      blockers: [blocker],
      next_route: "remove the named review blocker before another post-review embodiment route is admitted",
    };
  }

  if (input.requested_next_action !== "external_platform_embodiment") {
    return block(
      input,
      "block_non_progress_action",
      [`${input.requested_next_action} is not a post-review embodiment action`],
      "route fresh status through the status gate, not the post-review embodiment candidate gate",
      evidence,
    );
  }

  if (input.review_delta.kind !== "changes_requested" && input.review_delta.kind !== "actionable_comment") {
    return block(
      input,
      "block_non_actionable_review_delta",
      [`review delta ${input.review_delta.delta_id} is ${input.review_delta.kind}, not actionable repair feedback`],
      "use approval, pending, or dismissal deltas in their own review router before embodiment routing",
      evidence,
    );
  }

  const requiredFiles = unique(input.review_delta.file_paths);
  if (requiredFiles.length === 0) {
    return block(
      input,
      "block_unbounded_review_delta",
      [`review delta ${input.review_delta.delta_id} has no file-bound target`],
      "obtain file-bound review feedback or emit the exact external blocker before writing",
      evidence,
    );
  }

  const candidate = input.candidate;
  const incomplete = candidateBlockers(input);
  if (incomplete.length > 0) {
    return block(
      input,
      "block_incomplete_candidate",
      incomplete,
      "supply behavior, routing, and proof artifacts for the post-review embodiment candidate",
      evidence,
    );
  }

  if (!candidate) throw new Error("unreachable: candidate blockers checked above");

  const uncoveredFiles = requiredFiles.filter((file) => !candidate.changed_files.includes(file));
  if (uncoveredFiles.length > 0) {
    return block(
      input,
      "block_unbound_candidate_files",
      uncoveredFiles.map((file) => `review target not changed by candidate: ${file}`),
      "bind the executable embodiment to every file-bound review delta target before writing",
      [...evidence, ...candidate.changed_files],
    );
  }

  const signature = candidate.candidate_signature.trim();
  if (!signature || input.spent_candidate_signatures.includes(signature)) {
    return block(
      input,
      "block_spent_candidate_signature",
      [signature ? `post-review candidate signature already spent: ${signature}` : "post-review candidate has no signature"],
      "choose a semantically new post-review embodiment candidate before branch movement",
      [...evidence, ...candidate.changed_files],
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_post_review_embodiment",
    admitted_candidate_signature: signature,
    required_status_head_sha: null,
    decisive_evidence: [
      ...evidence,
      candidate.candidate_id,
      signature,
      ...requiredFiles.map((file) => `covers review target ${file}`),
      ...candidate.changed_files.filter(behaviorPath),
      ...candidate.behavior_exports,
      ...candidate.routing_artifacts,
      ...candidate.proof_artifacts,
    ],
    blockers: [],
    next_route: "write the admitted review-bound embodiment, then require status/readback for the moved resulting head before review or merge consumption",
  };
}
