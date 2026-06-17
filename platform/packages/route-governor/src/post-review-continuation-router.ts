export type PostReviewStatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "no_status_surface";

export type PostReviewPrState = "open" | "closed";

export type PostReviewBlockerIssueState = "open" | "closed" | "missing";

export type PostReviewContinuationAction =
  | "route_to_merge_gate"
  | "route_to_review_repair"
  | "wait_for_review_response"
  | "emit_exact_external_blocker"
  | "block_branch_mismatch"
  | "block_closed_pr"
  | "block_draft_pr"
  | "block_stale_repaired_head_blocker"
  | "block_unretired_ci_boundary"
  | "block_status_not_ready"
  | "block_replayed_route";

export interface PostReviewContinuationInput {
  repository_full_name: string;
  pr_number: number;
  branch: string;
  active_branch: string;
  live_head_sha: string;
  last_repaired_head_sha: string;
  last_status_readback_head_sha: string;
  pr_state: PostReviewPrState;
  pr_is_draft: boolean;
  mergeable: boolean | null;
  blocker_issue_state: PostReviewBlockerIssueState;
  blocker_labels: string[];
  live_status_verdict: PostReviewStatusVerdict;
  requested_reviewers: string[];
  approvals: string[];
  change_requests: string[];
  route_id: string;
  spent_route_ids: string[];
  known_external_blocker?: string;
}

export interface PostReviewContinuationVerdict {
  ok: boolean;
  action: PostReviewContinuationAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function normalize(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function statusReady(verdict: PostReviewStatusVerdict): boolean {
  return verdict === "passing" || verdict === "passing_with_warnings";
}

function base(input: PostReviewContinuationInput): Pick<
  PostReviewContinuationVerdict,
  "repository_full_name" | "pr_number" | "branch" | "head_sha"
> {
  return {
    repository_full_name: input.repository_full_name,
    pr_number: input.pr_number,
    branch: input.branch,
    head_sha: input.live_head_sha,
  };
}

function block(
  input: PostReviewContinuationInput,
  action: Exclude<
    PostReviewContinuationAction,
    "route_to_merge_gate" | "route_to_review_repair" | "wait_for_review_response"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): PostReviewContinuationVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function staleRepairedHeadBlocker(input: PostReviewContinuationInput): boolean {
  const blocker = input.known_external_blocker?.toLowerCase() ?? "";
  if (!blocker) return false;
  return blocker.includes(input.last_repaired_head_sha.toLowerCase()) && input.last_repaired_head_sha !== input.live_head_sha;
}

function ciBoundaryRetired(input: PostReviewContinuationInput): boolean {
  const labels = input.blocker_labels.map((label) => label.trim().toLowerCase());
  return input.blocker_issue_state === "closed" && !labels.includes("blocked: ci-status-readback");
}

export function routePostReviewContinuation(input: PostReviewContinuationInput): PostReviewContinuationVerdict {
  const routeId = input.route_id.trim();
  const requestedReviewers = normalize(input.requested_reviewers);
  const approvals = normalize(input.approvals);
  const changeRequests = normalize(input.change_requests);
  const evidence = [
    `route ${routeId || "<missing>"}`,
    `live head ${input.live_head_sha}`,
    `last repaired head ${input.last_repaired_head_sha}`,
    `last status readback head ${input.last_status_readback_head_sha}`,
    `status ${input.live_status_verdict}`,
  ];

  if (!routeId || input.spent_route_ids.includes(routeId)) {
    return block(
      input,
      "block_replayed_route",
      [routeId ? `post-review continuation route already spent: ${routeId}` : "post-review continuation route has no route id"],
      "compile a new durable post-review route id before claiming continuation progress",
      evidence,
    );
  }

  if (input.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`post-review branch ${input.branch} does not match active branch ${input.active_branch}`],
      "bind post-review continuation to the active manifestation branch before routing",
      evidence,
    );
  }

  if (input.pr_state !== "open") {
    return block(
      input,
      "block_closed_pr",
      [`PR #${input.pr_number} is ${input.pr_state}`],
      "do not route review or merge continuation from a closed PR surface",
      evidence,
    );
  }

  if (input.pr_is_draft) {
    return block(
      input,
      "block_draft_pr",
      ["PR is still draft; post-review continuation is not active"],
      "mark the PR ready for review before entering post-review continuation routing",
      evidence,
    );
  }

  if (staleRepairedHeadBlocker(input)) {
    return block(
      input,
      "block_stale_repaired_head_blocker",
      [`known blocker still targets repaired historical head ${input.last_repaired_head_sha}`],
      "discard the stale repaired-head blocker and bind continuation to the live PR head",
      evidence,
    );
  }

  if (!ciBoundaryRetired(input)) {
    return block(
      input,
      "block_unretired_ci_boundary",
      ["repaired-head CI boundary is not retired on the external PR/issue surface"],
      "close the blocker issue and remove the CI-status blocker label before post-review continuation",
      evidence,
    );
  }

  const exactBlocker = input.known_external_blocker?.trim();
  if (exactBlocker) {
    return block(
      input,
      "emit_exact_external_blocker",
      [exactBlocker],
      "remove the named live external blocker before review or merge routing",
      evidence,
    );
  }

  if (!statusReady(input.live_status_verdict)) {
    return block(
      input,
      "block_status_not_ready",
      [`live head status is ${input.live_status_verdict}`],
      "obtain passing live-head status or emit one exact current blocker before post-review continuation",
      evidence,
    );
  }

  if (changeRequests.length > 0) {
    return {
      ...base(input),
      ok: false,
      action: "route_to_review_repair",
      decisive_evidence: [...evidence, ...changeRequests.map((reviewer) => `changes requested by ${reviewer}`)],
      blockers: changeRequests.map((reviewer) => `review changes requested by ${reviewer}`),
      next_route: "repair the live-head review changes before compiling merge readiness",
    };
  }

  if (approvals.length > 0) {
    if (input.mergeable !== true) {
      return block(
        input,
        "emit_exact_external_blocker",
        [`PR approval exists but mergeable is ${String(input.mergeable)}`],
        "refresh mergeability or resolve the live merge blocker before compiling merge command",
        [...evidence, ...approvals.map((reviewer) => `approved by ${reviewer}`)],
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "route_to_merge_gate",
      decisive_evidence: [
        ...evidence,
        ...approvals.map((reviewer) => `approved by ${reviewer}`),
        "PR is open, non-draft, mergeable, and the repaired-head CI boundary is retired",
      ],
      blockers: [],
      next_route: "compile live-head merge readiness and merge command; do not return to repaired-head status readback",
    };
  }

  if (requestedReviewers.length === 0) {
    return block(
      input,
      "emit_exact_external_blocker",
      ["PR is ready but no live reviewer target or approval has surfaced"],
      "request a real reviewer or record the exact external review blocker",
      evidence,
    );
  }

  return {
    ...base(input),
    ok: false,
    action: "wait_for_review_response",
    decisive_evidence: [...evidence, ...requestedReviewers.map((reviewer) => `requested reviewer ${reviewer}`)],
    blockers: ["required live-head review response has not surfaced"],
    next_route: "wait for live-head review response; route approvals to merge gate and change requests to review repair",
  };
}
