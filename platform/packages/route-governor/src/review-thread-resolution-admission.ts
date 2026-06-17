export type ReviewThreadResolutionState = "resolved" | "unresolved" | "outdated";

export type ReviewThreadResolutionAction =
  | "admit_merge_readiness_after_threads"
  | "route_to_thread_resolution"
  | "route_to_review_repair"
  | "wait_for_live_review_approval"
  | "emit_exact_review_thread_blocker"
  | "block_stale_review_thread_surface"
  | "block_missing_review_thread_surface";

export interface ReviewThreadSurface {
  thread_id: string;
  path: string;
  head_sha: string;
  state: ReviewThreadResolutionState;
  reviewer?: string;
  last_comment_id?: string;
}

export interface ReviewThreadResolutionAdmissionInput {
  repository_full_name: string;
  pr_number: number;
  branch: string;
  live_head_sha: string;
  required_approval_count: number;
  approvals: string[];
  change_requests: string[];
  review_threads: ReviewThreadSurface[];
  exact_blocker?: string;
}

export interface ReviewThreadResolutionAdmissionVerdict {
  ok: boolean;
  action: ReviewThreadResolutionAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  unresolved_threads: string[];
  stale_threads: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function normalize(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function base(input: ReviewThreadResolutionAdmissionInput): Pick<
  ReviewThreadResolutionAdmissionVerdict,
  "repository_full_name" | "pr_number" | "branch" | "head_sha"
> {
  return {
    repository_full_name: input.repository_full_name,
    pr_number: input.pr_number,
    branch: input.branch,
    head_sha: input.live_head_sha,
  };
}

function threadLabel(thread: ReviewThreadSurface): string {
  const reviewer = thread.reviewer?.trim() ? ` by ${thread.reviewer.trim()}` : "";
  const comment = thread.last_comment_id?.trim() ? ` comment ${thread.last_comment_id.trim()}` : "";
  return `${thread.thread_id} at ${thread.path}${reviewer}${comment}`;
}

function block(
  input: ReviewThreadResolutionAdmissionInput,
  action: Exclude<
    ReviewThreadResolutionAction,
    "admit_merge_readiness_after_threads" | "route_to_thread_resolution" | "route_to_review_repair" | "wait_for_live_review_approval"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ReviewThreadResolutionAdmissionVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    unresolved_threads: [],
    stale_threads: [],
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

export function admitReviewThreadResolution(
  input: ReviewThreadResolutionAdmissionInput,
): ReviewThreadResolutionAdmissionVerdict {
  const exactBlocker = input.exact_blocker?.trim();
  const approvals = normalize(input.approvals);
  const changeRequests = normalize(input.change_requests);
  const requiredApprovals = Math.max(1, input.required_approval_count);
  const evidence = [`live head ${input.live_head_sha}`, `required approvals ${requiredApprovals}`];

  if (exactBlocker) {
    return block(
      input,
      "emit_exact_review_thread_blocker",
      [exactBlocker],
      "remove the named external review-thread blocker before merge-readiness admission",
      evidence,
    );
  }

  if (changeRequests.length > 0) {
    return {
      ...base(input),
      ok: false,
      action: "route_to_review_repair",
      unresolved_threads: [],
      stale_threads: [],
      decisive_evidence: [...evidence, ...changeRequests.map((reviewer) => `changes requested by ${reviewer}`)],
      blockers: changeRequests.map((reviewer) => `review changes requested by ${reviewer}`),
      next_route: "repair live-head review changes before resolving merge-readiness threads",
    };
  }

  if (approvals.length < requiredApprovals) {
    return {
      ...base(input),
      ok: false,
      action: "wait_for_live_review_approval",
      unresolved_threads: [],
      stale_threads: [],
      decisive_evidence: [...evidence, ...approvals.map((reviewer) => `approved by ${reviewer}`)],
      blockers: [`requires ${requiredApprovals} live-head approval(s); got ${approvals.length}`],
      next_route: "wait for live-head approval before review-thread merge admission",
    };
  }

  if (input.review_threads.length === 0) {
    return block(
      input,
      "block_missing_review_thread_surface",
      ["no live review-thread surface is attached"],
      "read live PR review threads before treating approval as merge readiness",
      [...evidence, ...approvals.map((reviewer) => `approved by ${reviewer}`)],
    );
  }

  const staleThreads = input.review_threads.filter((thread) => thread.head_sha !== input.live_head_sha);
  if (staleThreads.length > 0) {
    return {
      ...base(input),
      ok: false,
      action: "block_stale_review_thread_surface",
      unresolved_threads: [],
      stale_threads: staleThreads.map(threadLabel),
      decisive_evidence: [...evidence, ...staleThreads.map((thread) => `${thread.thread_id} belongs to ${thread.head_sha}`)],
      blockers: staleThreads.map((thread) => `review thread ${thread.thread_id} is not bound to live head ${input.live_head_sha}`),
      next_route: "discard stale review-thread surfaces and reread threads for the live PR head",
    };
  }

  const unresolvedThreads = input.review_threads.filter((thread) => thread.state === "unresolved");
  if (unresolvedThreads.length > 0) {
    return {
      ...base(input),
      ok: false,
      action: "route_to_thread_resolution",
      unresolved_threads: unresolvedThreads.map(threadLabel),
      stale_threads: [],
      decisive_evidence: [...evidence, ...unresolvedThreads.map((thread) => `unresolved thread ${threadLabel(thread)}`)],
      blockers: unresolvedThreads.map((thread) => `unresolved review thread ${thread.thread_id}`),
      next_route: "resolve live-head review threads before compiling merge readiness",
    };
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_merge_readiness_after_threads",
    unresolved_threads: [],
    stale_threads: [],
    decisive_evidence: [
      ...evidence,
      ...approvals.map((reviewer) => `approved by ${reviewer}`),
      ...input.review_threads.map((thread) => `thread ${thread.thread_id} ${thread.state} on ${thread.path}`),
    ],
    blockers: [],
    next_route: "enter merge readiness only while approvals, status, mergeability, and thread resolution remain bound to this live head",
  };
}
