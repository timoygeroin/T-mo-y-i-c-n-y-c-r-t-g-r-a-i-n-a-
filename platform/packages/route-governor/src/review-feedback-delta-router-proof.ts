import assert from "node:assert/strict";

import { routeReviewFeedbackDelta, type ReviewFeedbackDeltaRouterInput } from "./review-feedback-delta-router.js";

const head = "65d9e8630c424695b11abf1f1bc355eb22bfbb00";

function baseInput(overrides: Partial<ReviewFeedbackDeltaRouterInput> = {}): ReviewFeedbackDeltaRouterInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: head,
    delta_id: "review-feedback-delta-live-head-001",
    spent_delta_ids: [],
    required_approval_count: 1,
    requested_next_action: "review_repair",
    feedback_surfaces: [
      {
        feedback_id: "review-comment-001",
        reviewer: "external-reviewer",
        branch: "monday-platform-genesis-01",
        head_sha: head,
        kind: "changes_requested",
        file_paths: ["platform/packages/route-governor/src/review-to-merge-gate.ts"],
        body: "Bind review repair to the live head before merge gating.",
      },
    ],
    ...overrides,
  };
}

const boundedRepair = routeReviewFeedbackDelta(baseInput());
assert.equal(boundedRepair.ok, false);
assert.equal(boundedRepair.action, "route_feedback_to_bounded_repair");
assert.deepEqual(boundedRepair.repair_items[0]?.file_paths, [
  "platform/packages/route-governor/src/review-to-merge-gate.ts",
]);
assert.match(boundedRepair.next_route, /fresh status/);

const staleFeedback = routeReviewFeedbackDelta(
  baseInput({
    feedback_surfaces: [
      {
        ...baseInput().feedback_surfaces[0],
        head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
      },
    ],
  }),
);
assert.equal(staleFeedback.ok, false);
assert.equal(staleFeedback.action, "block_stale_feedback_head");
assert.match(staleFeedback.blockers.join("\n"), /not 65d9e863/);

const vagueRepair = routeReviewFeedbackDelta(
  baseInput({
    feedback_surfaces: [
      {
        ...baseInput().feedback_surfaces[0],
        file_paths: [],
      },
    ],
  }),
);
assert.equal(vagueRepair.ok, false);
assert.equal(vagueRepair.action, "block_vague_repair_feedback");

const approved = routeReviewFeedbackDelta(
  baseInput({
    requested_next_action: "merge_gate",
    feedback_surfaces: [
      {
        feedback_id: "review-approval-001",
        reviewer: "external-reviewer",
        branch: "monday-platform-genesis-01",
        head_sha: head,
        kind: "approval",
      },
    ],
  }),
);
assert.equal(approved.ok, true);
assert.equal(approved.action, "route_feedback_to_merge_gate");
assert.deepEqual(approved.approvals, ["external-reviewer"]);

const duplicateComment = routeReviewFeedbackDelta(
  baseInput({
    requested_next_action: "duplicate_comment",
  }),
);
assert.equal(duplicateComment.ok, false);
assert.equal(duplicateComment.action, "block_non_progress_action");
