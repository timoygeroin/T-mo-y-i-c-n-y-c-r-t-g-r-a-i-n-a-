import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { routeReviewFeedbackCursor, type ReviewFeedbackCursorInput } from "./review-feedback-cursor.js";

const branch = "monday-platform-genesis-01";
const liveHead = "review-feedback-cursor-live-head";
const oldHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function input(overrides: Partial<ReviewFeedbackCursorInput> = {}): ReviewFeedbackCursorInput {
  return {
    active_branch: branch,
    live_head_sha: liveHead,
    cursor_id: "review-feedback-cursor-001",
    spent_cursor_ids: [],
    seen_feedback_ids: [],
    requested_next_action: "review_feedback_delta",
    feedback_surfaces: [
      {
        feedback_id: "review-comment-101",
        branch,
        head_sha: liveHead,
        kind: "changes_requested",
        reviewer: "external-reviewer",
        file_paths: ["platform/packages/route-governor/src/review-feedback-cursor.ts"],
      },
    ],
    ...overrides,
  };
}

describe("routeReviewFeedbackCursor", () => {
  it("admits only unseen live-head review feedback", () => {
    const verdict = routeReviewFeedbackCursor(input());

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "admit_new_live_head_feedback");
    assert.deepEqual(verdict.new_feedback_ids, ["review-comment-101"]);
    assert.match(verdict.next_route, /review-feedback-delta-router/);
  });

  it("blocks review feedback that was already consumed by the cursor", () => {
    const verdict = routeReviewFeedbackCursor(input({ seen_feedback_ids: ["review-comment-101"] }));

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_seen_feedback_only");
    assert.match(verdict.blockers.join("\n"), /already consumed/);
  });

  it("waits without counting progress when no live-head review feedback exists", () => {
    const verdict = routeReviewFeedbackCursor(input({ feedback_surfaces: [], requested_next_action: "wait_for_review" }));

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "wait_for_new_review_feedback");
    assert.match(verdict.next_route, /do not replace it with metadata reread/);
  });

  it("blocks stale repaired-head review feedback", () => {
    const verdict = routeReviewFeedbackCursor(
      input({
        feedback_surfaces: [
          {
            feedback_id: "old-review-comment",
            branch,
            head_sha: oldHead,
            kind: "comment",
            reviewer: "external-reviewer",
          },
        ],
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_stale_feedback_head");
    assert.match(verdict.blockers.join("\n"), /not review-feedback-cursor-live-head/);
  });

  it("blocks non-progress actions before they consume cursor state", () => {
    const verdict = routeReviewFeedbackCursor(input({ requested_next_action: "metadata_reread" }));

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_non_progress_action");
    assert.match(verdict.blockers.join("\n"), /metadata_reread/);
  });

  it("emits an exact external blocker only with blocker text", () => {
    const missing = routeReviewFeedbackCursor(
      input({ requested_next_action: "exact_external_blocker", feedback_surfaces: [], exact_blocker: "" }),
    );
    assert.equal(missing.ok, false);
    assert.equal(missing.action, "block_missing_exact_blocker");

    const named = routeReviewFeedbackCursor(
      input({
        requested_next_action: "exact_external_blocker",
        feedback_surfaces: [],
        exact_blocker: "GitHub review API returned no live-head review timeline",
      }),
    );
    assert.equal(named.ok, true);
    assert.equal(named.action, "emit_exact_external_blocker");
    assert.deepEqual(named.blockers, ["GitHub review API returned no live-head review timeline"]);
  });
});
