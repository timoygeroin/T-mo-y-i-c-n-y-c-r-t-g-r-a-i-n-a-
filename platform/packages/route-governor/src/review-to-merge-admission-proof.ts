import assert from "node:assert/strict";
import { admitReviewToMerge, type ReviewToMergeAdmissionInput } from "./review-to-merge-admission.js";

const liveHead = "reviewed-live-head";

function input(overrides: Partial<ReviewToMergeAdmissionInput> = {}): ReviewToMergeAdmissionInput {
  return {
    admission_id: "review-to-merge-admission-01",
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
      decisive_evidence: ["current-head status surface 27049651460", "GitHub mergeability confirmed"],
      blockers: [],
      warnings: ["Node.js 20 Actions deprecation notice"],
      next_route: "request final review or merge through the authorized GitHub boundary",
    },
    ...overrides,
  };
}

function expectBlock(name: string, blockers: string[], expected: string): void {
  assert.ok(
    blockers.some((blocker) => blocker.includes(expected)),
    `${name} did not block on ${expected}; blockers: ${blockers.join("; ")}`,
  );
}

export function runReviewToMergeAdmissionProof(): void {
  const admitted = admitReviewToMerge(input());
  assert.equal(admitted.ok, true);
  assert.equal(admitted.action, "admit_reviewed_merge_readiness");
  assert.equal(admitted.admission_id, "review-to-merge-admission-01");
  assert.deepEqual(admitted.approvals, ["reviewer-a"]);
  assert.deepEqual(admitted.blockers, []);
  assert.ok(admitted.decisive_evidence.includes("admission review-to-merge-admission-01"));

  const staleReview = admitReviewToMerge(
    input({
      review: {
        ...input().review,
        head_sha: "historical-reviewed-head",
      },
    }),
  );
  assert.equal(staleReview.ok, false);
  assert.equal(staleReview.action, "block_stale_review_head");
  expectBlock("stale review", staleReview.blockers, "not live head");

  const requestedChanges = admitReviewToMerge(
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
  assert.equal(requestedChanges.ok, false);
  assert.equal(requestedChanges.action, "route_to_review_repair");
  expectBlock("requested changes", requestedChanges.blockers, "review changes requested");

  const unreadyMerge = admitReviewToMerge(
    input({
      readiness: {
        ...input().readiness,
        ok: false,
        action: "wait_for_checks",
        decisive_evidence: ["Route Governor Proof pending"],
        blockers: ["Route Governor Proof pending"],
      },
    }),
  );
  assert.equal(unreadyMerge.ok, false);
  assert.equal(unreadyMerge.action, "block_unready_merge_gate");
  expectBlock("unready merge", unreadyMerge.blockers, "pending");

  const replayed = admitReviewToMerge(
    input({
      spent_admission_ids: ["review-to-merge-admission-01"],
    }),
  );
  assert.equal(replayed.ok, false);
  assert.equal(replayed.action, "block_replayed_admission");
  expectBlock("replayed admission", replayed.blockers, "already spent");
}

runReviewToMergeAdmissionProof();
