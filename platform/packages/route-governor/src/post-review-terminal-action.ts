import type { ReviewResponseRouterVerdict } from "./review-response-router.js";

export type PostReviewTerminalOperation =
  | "merge_live_head"
  | "commit_requested_changes_repair"
  | "request_live_head_review"
  | "commit_review_comment_embodiment"
  | "emit_exact_external_blocker";

export interface PostReviewTerminalActionInput {
  active_branch: string;
  live_head_sha: string;
  review_verdict: ReviewResponseRouterVerdict;
  allowed_operations: PostReviewTerminalOperation[];
  spent_operation_ids: string[];
  operation_id: string;
}

export interface PostReviewTerminalActionVerdict {
  ok: boolean;
  operation: PostReviewTerminalOperation;
  branch: string;
  head_sha: string;
  operation_id: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function operationFor(verdict: ReviewResponseRouterVerdict): PostReviewTerminalOperation {
  switch (verdict.action) {
    case "admit_merge_after_approval":
      return "merge_live_head";
    case "route_requested_changes_to_repair":
      return "commit_requested_changes_repair";
    case "route_to_review_request":
      return "request_live_head_review";
    case "route_comments_to_embodiment":
      return "commit_review_comment_embodiment";
    default:
      return "emit_exact_external_blocker";
  }
}

function blockerVerdict(input: PostReviewTerminalActionInput, blockers: string[]): PostReviewTerminalActionVerdict {
  return {
    ok: false,
    operation: "emit_exact_external_blocker",
    branch: input.review_verdict.branch,
    head_sha: input.review_verdict.head_sha,
    operation_id: input.operation_id,
    decisive_evidence: input.review_verdict.decisive_evidence,
    blockers,
    next_route: "clear the post-review terminal blocker before issuing a merge, repair, review request, or embodiment operation",
  };
}

export function compilePostReviewTerminalAction(
  input: PostReviewTerminalActionInput,
): PostReviewTerminalActionVerdict {
  const blockers: string[] = [];
  const verdict = input.review_verdict;
  const operation = operationFor(verdict);

  if (verdict.branch !== input.active_branch) {
    blockers.push(`review verdict branch ${verdict.branch} does not match active branch ${input.active_branch}`);
  }

  if (verdict.head_sha !== input.live_head_sha) {
    blockers.push(`review verdict head ${verdict.head_sha} does not match live head ${input.live_head_sha}`);
  }

  if (input.spent_operation_ids.includes(input.operation_id)) {
    blockers.push(`post-review terminal operation already spent: ${input.operation_id}`);
  }

  if (!input.operation_id.trim()) {
    blockers.push("post-review terminal operation has no operation id");
  }

  if (!verdict.ok) {
    blockers.push(...verdict.blockers);
  }

  if (!input.allowed_operations.includes(operation)) {
    blockers.push(`post-review terminal operation is not allowed here: ${operation}`);
  }

  if (operation === "merge_live_head" && verdict.accepted_review_surface_ids.length === 0) {
    blockers.push("merge operation has no accepted live review surface");
  }

  if (operation === "commit_requested_changes_repair") {
    const hasBehaviorRepair = verdict.decisive_evidence.some((item) =>
      item.startsWith("platform/packages/route-governor/src/") &&
      /\.(ts|js|mjs|json)$/.test(item) &&
      !/(?:\.test|-proof)\.ts$/.test(item),
    );

    if (!hasBehaviorRepair) {
      blockers.push("requested-changes repair operation has no behavior-bearing executable file evidence");
    }
  }

  if (operation === "emit_exact_external_blocker" && verdict.blockers.length === 0) {
    blockers.push("exact blocker operation has no concrete review-response blocker");
  }

  if (blockers.length > 0) {
    return blockerVerdict(input, blockers);
  }

  return {
    ok: true,
    operation,
    branch: verdict.branch,
    head_sha: verdict.head_sha,
    operation_id: input.operation_id,
    decisive_evidence: [input.operation_id, verdict.action, ...verdict.decisive_evidence],
    blockers: [],
    next_route:
      operation === "merge_live_head"
        ? "merge only while the live-head review and status guards still match"
        : "execute this post-review operation, then require moved-head status and review readback before the next terminal action",
  };
}
