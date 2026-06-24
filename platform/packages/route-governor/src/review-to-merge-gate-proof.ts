import assert from "node:assert/strict";

import { compileReviewToMergeGate, type ReviewToMergeGateInput } from "./review-to-merge-gate.js";

const head = "84ee38a1711e9bda79e36e8d82dcc36c35b111de";

function gateInput(overrides: Partial<ReviewToMergeGateInput> = {}): ReviewToMergeGateInput {
  return {
    gate_id: "review-to-merge-proof-001",
    spent_gate_ids: [],
    active_branch: "monday-platform-genesis-01",
    live_head_sha: head,
    draft: false,
    mergeable: true,
    required_approval_count: 1,
    review_intake: {
      ok: true,
      action: "route_to_merge_gate",
      repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
      pr_number: 2,
      branch: "monday-platform-genesis-01",
      head_sha: head,
      approvals: ["external-reviewer"],
      change_requests: [],
      pending_reviewers: [],
      decisive_evidence: [`live head ${head}`, "approved by external-reviewer"],
      blockers: [],
      next_route: "enter merge gate only after live-head status and mergeability are still current",
    },
    mergeability_lease: {
      ok: true,
      action: "admit_mergeability_lease",
      branch: "monday-platform-genesis-01",
      head_sha: head,
      lease_id: "mergeability-proof-001",
      target: "merge_command",
      decisive_evidence: [`live head ${head}`, "mergeable true"],
      blockers: [],
      next_route: "use this lease only for the named target on the live head; refresh mergeability after any branch movement",
    },
    status_surface: {
      surface_id: "current-checks-proof-001",
      head_sha: head,
      verdict: "passing_with_warnings",
      decisive_successes: ["Route governor proof examples succeeded"],
      blocking_failures: [],
      pending_surfaces: [],
      non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
    },
    ...overrides,
  };
}

const admitted = compileReviewToMergeGate(gateInput());
assert.equal(admitted.ok, true);
assert.equal(admitted.action, "admit_merge_finalization_gate");
assert.equal(admitted.next_route, "compile merge finalization only while review approval, mergeability, and status all remain bound to this live head");

const staleStatus = compileReviewToMergeGate(
  gateInput({
    status_surface: {
      ...gateInput().status_surface!,
      head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
    },
  }),
);
assert.equal(staleStatus.ok, false);
assert.equal(staleStatus.action, "block_status_not_current");

const waitingReview = compileReviewToMergeGate(
  gateInput({
    review_intake: {
      ...gateInput().review_intake,
      ok: false,
      action: "wait_for_review_response",
      approvals: [],
      pending_reviewers: ["external-reviewer"],
      blockers: ["required review approval has not surfaced on the live head"],
    },
  }),
);
assert.equal(waitingReview.ok, false);
assert.equal(waitingReview.action, "wait_for_review_response");

const staleLease = compileReviewToMergeGate(
  gateInput({
    mergeability_lease: {
      ...gateInput().mergeability_lease!,
      head_sha: "previous-head",
    },
  }),
);
assert.equal(staleLease.ok, false);
assert.equal(staleLease.action, "block_stale_mergeability_lease");
