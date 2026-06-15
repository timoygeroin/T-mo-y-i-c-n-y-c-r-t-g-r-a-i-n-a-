import assert from "node:assert/strict";
import { test } from "node:test";

import { compilePostReviewTerminalAction, type PostReviewTerminalActionInput } from "./post-review-terminal-action.js";
import { routeReviewResponse, type ReviewResponseRouterInput } from "./review-response-router.js";

const branch = "monday-platform-genesis-01";
const head = "review-live-head";

function reviewInput(overrides: Partial<ReviewResponseRouterInput> = {}): ReviewResponseRouterInput {
  return {
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch,
    active_branch: branch,
    live_head_sha: head,
    mergeable: true,
    status_verdict: "passing_with_warnings",
    requested_action: "merge",
    review_surfaces: [
      {
        surface_id: "review-approval-1",
        head_sha: head,
        reviewer: "reviewer-a",
        state: "approved",
      },
    ],
    ...overrides,
  };
}

function terminalInput(overrides: Partial<PostReviewTerminalActionInput> = {}): PostReviewTerminalActionInput {
  return {
    active_branch: branch,
    live_head_sha: head,
    review_verdict: routeReviewResponse(reviewInput()),
    allowed_operations: [
      "merge_live_head",
      "commit_requested_changes_repair",
      "request_live_head_review",
      "commit_review_comment_embodiment",
      "emit_exact_external_blocker",
    ],
    spent_operation_ids: [],
    operation_id: "review-approval-merge-live-head",
    ...overrides,
  };
}

test("compiles an approved live-head review into a guarded merge operation", () => {
  const verdict = compilePostReviewTerminalAction(terminalInput());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.operation, "merge_live_head");
  assert.equal(verdict.head_sha, head);
  assert(verdict.decisive_evidence.includes("review-approval-1"));
});

test("routes requested changes into a behavior-bearing repair operation", () => {
  const review_verdict = routeReviewResponse(
    reviewInput({
      requested_action: "current_head_repair",
      review_surfaces: [
        {
          surface_id: "review-changes-1",
          head_sha: head,
          reviewer: "reviewer-a",
          state: "changes_requested",
          body_excerpt: "repair the review-response gate",
        },
      ],
      repair_candidate: {
        changed_files: ["platform/packages/route-governor/src/review-response-router.ts"],
        executable_artifacts: ["routeReviewResponse"],
        routing_artifacts: ["requested changes route to current-head repair"],
        proof_artifacts: ["dist/review-response-router-proof.js"],
        failure_signature: "repair the review-response gate",
      },
    }),
  );

  const verdict = compilePostReviewTerminalAction(
    terminalInput({
      review_verdict,
      operation_id: "review-changes-repair-live-head",
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.operation, "commit_requested_changes_repair");
  assert(verdict.decisive_evidence.includes("platform/packages/route-governor/src/review-response-router.ts"));
});

test("blocks proof-only requested-changes repairs", () => {
  const review_verdict = routeReviewResponse(
    reviewInput({
      requested_action: "current_head_repair",
      review_surfaces: [
        {
          surface_id: "review-changes-1",
          head_sha: head,
          reviewer: "reviewer-a",
          state: "changes_requested",
          body_excerpt: "repair the proof only",
        },
      ],
      repair_candidate: {
        changed_files: ["platform/packages/route-governor/src/review-response-router-proof.ts"],
        executable_artifacts: ["routeReviewResponse"],
        routing_artifacts: ["requested changes route to current-head repair"],
        proof_artifacts: ["dist/review-response-router-proof.js"],
        failure_signature: "repair the proof only",
      },
    }),
  );

  const verdict = compilePostReviewTerminalAction(
    terminalInput({
      review_verdict,
      operation_id: "proof-only-review-repair",
      allowed_operations: ["commit_requested_changes_repair", "emit_exact_external_blocker"],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.operation, "emit_exact_external_blocker");
  assert(verdict.blockers.some((blocker) => blocker.includes("proof-only")));
});

test("routes missing review surfaces into a guarded review request operation", () => {
  const review_verdict = routeReviewResponse(reviewInput({ requested_action: "request_review", review_surfaces: [] }));
  const verdict = compilePostReviewTerminalAction(
    terminalInput({
      review_verdict,
      operation_id: "request-review-live-head",
      allowed_operations: ["request_live_head_review"],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.operation, "request_live_head_review");
});

test("blocks stale or repeated post-review operations", () => {
  const staleReview = routeReviewResponse(
    reviewInput({
      review_surfaces: [
        {
          surface_id: "old-review",
          head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
          reviewer: "reviewer-a",
          state: "approved",
        },
      ],
    }),
  );

  const stale = compilePostReviewTerminalAction(
    terminalInput({
      review_verdict: staleReview,
      operation_id: "old-review-merge",
    }),
  );
  assert.equal(stale.ok, false);
  assert.equal(stale.operation, "emit_exact_external_blocker");
  assert(stale.blockers.some((blocker) => blocker.includes("not review-live-head")));

  const repeated = compilePostReviewTerminalAction(
    terminalInput({
      operation_id: "review-approval-merge-live-head",
      spent_operation_ids: ["review-approval-merge-live-head"],
    }),
  );
  assert.equal(repeated.ok, false);
  assert(repeated.blockers.some((blocker) => blocker.includes("already spent")));
});
