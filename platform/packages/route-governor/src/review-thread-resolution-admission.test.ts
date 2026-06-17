import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { admitReviewThreadResolution, type ReviewThreadResolutionAdmissionInput } from "./review-thread-resolution-admission.js";

function input(overrides: Partial<ReviewThreadResolutionAdmissionInput> = {}): ReviewThreadResolutionAdmissionInput {
  const liveHead = "0d43612629dd1ee5553eff5cb81fb0dac7c77875";
  return {
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    required_approval_count: 1,
    approvals: ["reviewer-a"],
    change_requests: [],
    review_threads: [
      {
        thread_id: "thread-1",
        path: "platform/packages/route-governor/src/review-thread-resolution-admission.ts",
        head_sha: liveHead,
        state: "resolved",
        reviewer: "reviewer-a",
        last_comment_id: "comment-1",
      },
    ],
    ...overrides,
  };
}

describe("admitReviewThreadResolution", () => {
  it("admits merge readiness only after live approval and resolved live threads", () => {
    const verdict = admitReviewThreadResolution(input());

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "admit_merge_readiness_after_threads");
    assert.deepEqual(verdict.blockers, []);
  });

  it("routes unresolved live threads to thread resolution instead of merge readiness", () => {
    const verdict = admitReviewThreadResolution(
      input({ review_threads: [{ ...input().review_threads[0], state: "unresolved" }] }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "route_to_thread_resolution");
    assert.deepEqual(verdict.blockers, ["unresolved review thread thread-1"]);
  });

  it("rejects stale thread surfaces from older heads", () => {
    const verdict = admitReviewThreadResolution(
      input({ review_threads: [{ ...input().review_threads[0], head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }] }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_stale_review_thread_surface");
  });

  it("routes change requests to repair before thread-resolution admission", () => {
    const verdict = admitReviewThreadResolution(input({ change_requests: ["reviewer-a"] }));

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "route_to_review_repair");
  });
});
