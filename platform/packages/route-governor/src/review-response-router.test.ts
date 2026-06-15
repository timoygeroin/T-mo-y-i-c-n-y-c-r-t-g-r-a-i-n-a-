import assert from "node:assert/strict";
import { test } from "node:test";

import { routeReviewResponse, type ReviewResponseRouterInput } from "./review-response-router.js";

const head = "review-live-head";
const olderHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function input(overrides: Partial<ReviewResponseRouterInput> = {}): ReviewResponseRouterInput {
  return {
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch: "monday-platform-genesis-01",
    active_branch: "monday-platform-genesis-01",
    live_head_sha: head,
    mergeable: true,
    status_verdict: "passing_with_warnings",
    requested_action: "merge",
    review_surfaces: [
      {
        surface_id: "review-approval-1",
        head_sha: head,
        reviewer: "timoygeroin",
        state: "approved",
        submitted_at: "2026-06-15T15:00:00Z",
      },
    ],
    ...overrides,
  };
}

test("admits merge only after live-head approval, mergeability, and passing status", () => {
  const verdict = routeReviewResponse(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_merge_after_approval");
  assert.deepEqual(verdict.accepted_review_surface_ids, ["review-approval-1"]);
  assert.deepEqual(verdict.blockers, []);
});

test("routes requested changes to a behavior-bearing repair candidate", () => {
  const verdict = routeReviewResponse(
    input({
      requested_action: "current_head_repair",
      review_surfaces: [
        {
          surface_id: "review-changes-1",
          head_sha: head,
          reviewer: "reviewer-a",
          state: "changes_requested",
          body_excerpt: "route denial must cite the live check run",
        },
      ],
      repair_candidate: {
        changed_files: ["platform/packages/route-governor/src/review-response-router.ts"],
        executable_artifacts: ["routeReviewResponse"],
        routing_artifacts: ["requested changes route to current-head repair"],
        proof_artifacts: ["dist/review-response-router-proof.js"],
        failure_signature: "route denial must cite the live check run",
      },
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "route_requested_changes_to_repair");
  assert(verdict.decisive_evidence.includes("routeReviewResponse"));
});

test("blocks stale review surfaces from older heads", () => {
  const verdict = routeReviewResponse(
    input({
      review_surfaces: [
        {
          surface_id: "old-review",
          head_sha: olderHead,
          reviewer: "timoygeroin",
          state: "approved",
        },
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_review_surface");
  assert.deepEqual(verdict.stale_review_surface_ids, ["old-review"]);
});

test("routes missing live review to a guarded review request", () => {
  const verdict = routeReviewResponse(input({ requested_action: "request_review", review_surfaces: [] }));

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "route_to_review_request");
});

test("blocks duplicate comments and metadata rereads as review response progress", () => {
  const verdict = routeReviewResponse(input({ requested_action: "duplicate_comment" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_progress_action");
});

test("routes comments-only review surfaces into the next embodiment", () => {
  const verdict = routeReviewResponse(
    input({
      requested_action: "continue_embodiment",
      review_surfaces: [
        {
          surface_id: "review-comment-1",
          head_sha: head,
          reviewer: "reviewer-a",
          state: "commented",
          body_excerpt: "consider extracting the status evidence formatter",
        },
      ],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "route_comments_to_embodiment");
});
