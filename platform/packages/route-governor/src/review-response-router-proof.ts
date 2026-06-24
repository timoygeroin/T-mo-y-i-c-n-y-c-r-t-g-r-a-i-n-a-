import assert from "node:assert/strict";

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

const approved = routeReviewResponse(input());
assert.equal(approved.ok, true);
assert.equal(approved.action, "admit_merge_after_approval");
assert.equal(approved.head_sha, head);
assert.deepEqual(approved.accepted_review_surface_ids, ["review-approval-1"]);

const requestedChanges = routeReviewResponse(
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
assert.equal(requestedChanges.ok, true);
assert.equal(requestedChanges.action, "route_requested_changes_to_repair");

const stale = routeReviewResponse(
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
assert.equal(stale.ok, false);
assert.equal(stale.action, "block_stale_review_surface");
assert.deepEqual(stale.stale_review_surface_ids, ["old-review"]);

const missing = routeReviewResponse(input({ requested_action: "request_review", review_surfaces: [] }));
assert.equal(missing.ok, true);
assert.equal(missing.action, "route_to_review_request");

const duplicate = routeReviewResponse(input({ requested_action: "metadata_reread" }));
assert.equal(duplicate.ok, false);
assert.equal(duplicate.action, "block_non_progress_action");

console.log("review response router proof passed");
