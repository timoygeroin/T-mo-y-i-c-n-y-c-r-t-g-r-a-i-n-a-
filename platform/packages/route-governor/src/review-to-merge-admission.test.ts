import assert from "node:assert/strict";
import test from "node:test";
import { admitReviewToMerge, type ReviewToMergeAdmissionInput } from "./review-to-merge-admission.js";

const liveHead = "reviewed-live-head";

function input(overrides: Partial<ReviewToMergeAdmissionInput> = {}): ReviewToMergeAdmissionInput {
  return {
    admission_id: "review-to-merge-admission-test",
    spent_admission_ids: [],
    live_head_sha: liveHead,
    required_approval_count: 1,
    review: {
      ok: true,
      action: "route_to_merge_gate",
      repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
      pr_number: 2,
      branch: "monday-platform-genesis-01",
      head_sha: liveHead,
      approvals: ["reviewer-a"],
      change_requests: [],
      pending_reviewers: [],
      decisive_evidence: ["approved by reviewer-a"],
      blockers: [],
      next_route: "enter merge gate only after live-head status and mergeability are still current",
    },
    readiness: {
      ok: true,
      action: "merge_ready",
      repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
      pr_number: 2,
      branch: "monday-platform-genesis-01",
      head_sha: liveHead,
      decisive_evidence: ["current-head status surface 27049651460"],
      blockers: [],
      warnings: [],
      next_route: "request final review or merge through the authorized GitHub boundary",
    },
    ...overrides,
  };
}

test("admits merge only after live-head review approval and merge readiness", () => {
  const verdict = admitReviewToMerge(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_reviewed_merge_readiness");
  assert.equal(verdict.head_sha, liveHead);
  assert.deepEqual(verdict.approvals, ["reviewer-a"]);
  assert.deepEqual(verdict.blockers, []);
});

test("blocks merge admission when review intake is stale", () => {
  const verdict = admitReviewToMerge(
    input({
      review: {
        ...input().review,
        head_sha: "old-head",
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_review_head");
  assert.ok(verdict.blockers.some((blocker) => blocker.includes("not live head")));
});

test("routes requested changes to repair before merge", () => {
  const verdict = admitReviewToMerge(
    input({
      review: {
        ...input().review,
        ok: false,
        action: "route_to_review_repair",
        approvals: [],
        change_requests: ["reviewer-a"],
        decisive_evidence: ["changes requested by reviewer-a"],
        blockers: ["review changes requested by reviewer-a"],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "route_to_review_repair");
  assert.ok(verdict.blockers.some((blocker) => blocker.includes("review changes requested")));
});

test("blocks replayed admissions", () => {
  const verdict = admitReviewToMerge(
    input({
      spent_admission_ids: ["review-to-merge-admission-test"],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_replayed_admission");
});
