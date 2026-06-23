export type ReviewWaitCandidateClass = "external_platform_embodiment" | "fresh_status_readback" | "exact_external_blocker";

export type ReviewWaitStatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "unknown";

export type ReviewWaitBarrierAction =
  | "hold_for_review_feedback"
  | "admit_review_bound_embodiment"
  | "read_moved_head_status"
  | "emit_exact_external_blocker"
  | "block_branch_mismatch"
  | "block_head_mismatch"
  | "block_pr_not_review_ready"
  | "block_unresolved_status"
  | "block_incomplete_embodiment"
  | "block_missing_exact_blocker";

export interface ReviewWaitCandidate {
  move_class: ReviewWaitCandidateClass;
  branch: string;
  base_head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  blocker?: string;
  review_feedback_ids?: string[];
  live_failure_signature?: string;
}

export interface ReviewWaitBarrierInput {
  active_branch: string;
  live_head_sha: string;
  last_status_readback_head_sha?: string;
  pr_open: boolean;
  draft: boolean;
  mergeable: boolean | null;
  status_verdict: ReviewWaitStatusVerdict;
  review_feedback_pending: boolean;
  candidate: ReviewWaitCandidate;
}

export interface ReviewWaitBarrierVerdict {
  ok: boolean;
  action: ReviewWaitBarrierAction;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function proofOnlyPath(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function base(input: ReviewWaitBarrierInput): Pick<ReviewWaitBarrierVerdict, "branch" | "head_sha"> {
  return { branch: input.active_branch, head_sha: input.live_head_sha };
}

function block(
  input: ReviewWaitBarrierInput,
  action: Exclude<
    ReviewWaitBarrierAction,
    "hold_for_review_feedback" | "admit_review_bound_embodiment" | "read_moved_head_status" | "emit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  decisiveEvidence: string[] = [],
): ReviewWaitBarrierVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: decisiveEvidence,
    blockers,
    next_route: nextRoute,
  };
}

function statusIsClear(status: ReviewWaitStatusVerdict): boolean {
  return status === "passing" || status === "passing_with_warnings";
}

function incompleteEmbodiment(candidate: ReviewWaitCandidate): string[] {
  const executableChanges = candidate.changed_files.filter(executablePlatformPath);
  const behaviorChanges = executableChanges.filter((path) => !proofOnlyPath(path));
  const blockers: string[] = [];

  if (executableChanges.length === 0) blockers.push("review-wait embodiment changes no executable platform file");
  if (executableChanges.length > 0 && behaviorChanges.length === 0) {
    blockers.push("review-wait embodiment is proof-only and has no behavior file");
  }
  if (candidate.executable_artifacts.length === 0) blockers.push("review-wait embodiment has no executable artifact evidence");
  if (candidate.routing_artifacts.length === 0) blockers.push("review-wait embodiment has no future-routing artifact evidence");
  if (candidate.proof_artifacts.length === 0) blockers.push("review-wait embodiment has no proof artifact evidence");

  return blockers;
}

function reviewBound(candidate: ReviewWaitCandidate): boolean {
  return Boolean(candidate.live_failure_signature?.trim()) || (candidate.review_feedback_ids ?? []).length > 0;
}

export function routeReviewWaitBarrier(input: ReviewWaitBarrierInput): ReviewWaitBarrierVerdict {
  const candidate = input.candidate;

  if (candidate.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`],
      "bind the candidate to the active PR branch before scheduled finalization can continue",
    );
  }

  if (candidate.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_head_mismatch",
      [`candidate base ${candidate.base_head_sha} is not live PR head ${input.live_head_sha}`],
      "rebase the candidate to the live PR head before review-wait routing",
    );
  }

  if (!input.pr_open || input.draft || input.mergeable !== true) {
    return block(
      input,
      "block_pr_not_review_ready",
      [
        `pr_open=${input.pr_open}`,
        `draft=${input.draft}`,
        `mergeable=${String(input.mergeable)}`,
      ],
      "restore an open non-draft mergeable PR surface before holding or advancing review state",
    );
  }

  if (candidate.move_class === "fresh_status_readback") {
    const headMoved = input.last_status_readback_head_sha !== input.live_head_sha;
    if (!headMoved && input.status_verdict === "unknown") {
      return block(
        input,
        "block_unresolved_status",
        ["fresh status readback requires a moved head or an attached live-head status verdict"],
        "obtain live-head status evidence before publishing a readback",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "read_moved_head_status",
      decisive_evidence: [
        ...(headMoved ? [`head moved from ${input.last_status_readback_head_sha ?? "<none>"} to ${input.live_head_sha}`] : []),
        `status verdict ${input.status_verdict}`,
      ],
      blockers: [],
      next_route: "publish only the live-head status readback, then return to review-wait or review-feedback routing",
    };
  }

  if (candidate.move_class === "exact_external_blocker") {
    const blocker = candidate.blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_missing_exact_blocker",
        ["review-wait exact blocker candidate has no blocker text"],
        "name one exact live-head external blocker or preserve the review wait",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_exact_external_blocker",
      decisive_evidence: [blocker, `live head ${input.live_head_sha}`],
      blockers: [blocker],
      next_route: "remove the named blocker before another review-wait continuation",
    };
  }

  if (!statusIsClear(input.status_verdict)) {
    return block(
      input,
      "block_unresolved_status",
      [`status verdict ${input.status_verdict} is not clear for review wait`],
      "resolve live-head status before adding non-review embodiment work",
    );
  }

  if (!reviewBound(candidate)) {
    return {
      ...base(input),
      ok: false,
      action: "hold_for_review_feedback",
      decisive_evidence: [
        `live head ${input.live_head_sha}`,
        `status verdict ${input.status_verdict}`,
        "open non-draft mergeable PR is already in review-ready state",
      ],
      blockers: ["no live review feedback or live failure authorizes another embodiment write"],
      next_route: input.review_feedback_pending
        ? "wait for reviewer feedback; do not treat another scheduled embodiment write as progress"
        : "request or await final review instead of adding unbound scheduled embodiment work",
    };
  }

  const blockers = incompleteEmbodiment(candidate);
  if (blockers.length > 0) {
    return block(
      input,
      "block_incomplete_embodiment",
      blockers,
      "complete behavior-bearing executable, routing, and proof evidence before moving the review-ready branch",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_review_bound_embodiment",
    decisive_evidence: [
      `live head ${input.live_head_sha}`,
      `status verdict ${input.status_verdict}`,
      ...(candidate.review_feedback_ids ?? []).map((id) => `review feedback ${id}`),
      ...(candidate.live_failure_signature ? [`live failure ${candidate.live_failure_signature}`] : []),
      ...candidate.changed_files.filter(executablePlatformPath),
      ...candidate.executable_artifacts,
      ...candidate.routing_artifacts,
      ...candidate.proof_artifacts,
    ],
    blockers: [],
    next_route: "commit only the review-bound embodiment, then require status readback for the moved head",
  };
}
