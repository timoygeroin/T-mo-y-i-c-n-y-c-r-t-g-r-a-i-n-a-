import assert from "node:assert/strict";
import test from "node:test";

import { compileReviewApprovedMergeCommand } from "./review-approved-merge-command.js";
import { compileReviewApprovedMergeExecutionLease } from "./review-approved-merge-execution-lease.js";
import type { MergeReadinessVerdict } from "./merge-readiness.js";
import type { ReviewResponseIntakeVerdict } from "./review-response-intake.js";

const head = "d16c40825d611a6709e7dbc4d3c85669f2dfd8b5";

function review(overrides: Partial<ReviewResponseIntakeVerdict> = {}): ReviewResponseIntakeVerdict {
  return {
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
    ...overrides,
  };
}

function readiness(overrides: Partial<MergeReadinessVerdict> = {}): MergeReadinessVerdict {
  return {
    ok: true,
    action: "merge_ready",
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch: "monday-platform-genesis-01",
    head_sha: head,
    decisive_evidence: ["Route Governor Proof succeeded", "GitHub mergeability true"],
    blockers: [],
    warnings: ["Node.js 20 Actions deprecation notice"],
    next_route: "request final review or merge through the authorized GitHub boundary",
    ...overrides,
  };
}

function command() {
  return compileReviewApprovedMergeCommand({
    review_intake: review(),
    merge_readiness: readiness(),
    live_head_sha: head,
    command_id: `review-approved-merge-pr-2:${head}`,
    spent_command_ids: [],
    external_boundary: "github_pull_request_merge",
    merge_method: "squash",
  });
}

test("leases review-approved merge execution for the live head exactly once", () => {
  const verdict = compileReviewApprovedMergeExecutionLease({
    review_approved_command: command(),
    live_head_sha: head,
    lease_id: `review-approved-merge-execution-pr-2:${head}`,
    spent_lease_ids: [],
    external_boundary: "github_pull_request_merge",
  });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "compile_review_approved_merge_execution_lease");
  assert.equal(verdict.lease?.operation, "merge_pull_request");
  assert.equal(verdict.lease?.head_sha, head);
  assert.equal(verdict.lease?.guard.require_live_head_sha, head);
  assert.equal(verdict.lease?.guard.require_review_approved_command, true);
  assert.deepEqual(verdict.blockers, []);
});

test("blocks lease compilation when review approval has not reached the merge gate", () => {
  const unapprovedCommand = compileReviewApprovedMergeCommand({
    review_intake: review({
      ok: false,
      action: "wait_for_review_response",
      approvals: [],
      pending_reviewers: ["external-reviewer"],
      blockers: ["required review approval has not surfaced on the live head"],
    }),
    merge_readiness: readiness(),
    live_head_sha: head,
    command_id: `review-approved-merge-pr-2:${head}`,
    spent_command_ids: [],
    external_boundary: "github_pull_request_merge",
    merge_method: "squash",
  });

  const verdict = compileReviewApprovedMergeExecutionLease({
    review_approved_command: unapprovedCommand,
    live_head_sha: head,
    lease_id: `review-approved-merge-execution-pr-2:${head}`,
    spent_lease_ids: [],
    external_boundary: "github_pull_request_merge",
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_uncompiled_review_merge");
  assert.match(verdict.blockers.join("\n"), /required review approval/);
});

test("blocks stale or replayed execution leases", () => {
  const stale = compileReviewApprovedMergeExecutionLease({
    review_approved_command: command(),
    live_head_sha: "newer-live-head",
    lease_id: `review-approved-merge-execution-pr-2:${head}`,
    spent_lease_ids: [],
    external_boundary: "github_pull_request_merge",
  });

  assert.equal(stale.ok, false);
  assert.equal(stale.action, "block_stale_command_head");

  const replay = compileReviewApprovedMergeExecutionLease({
    review_approved_command: command(),
    live_head_sha: head,
    lease_id: `review-approved-merge-execution-pr-2:${head}`,
    spent_lease_ids: [`review-approved-merge-execution-pr-2:${head}`],
    external_boundary: "github_pull_request_merge",
  });

  assert.equal(replay.ok, false);
  assert.equal(replay.action, "block_replayed_execution_lease");
});

test("blocks non-merge boundaries from standing in for execution", () => {
  const verdict = compileReviewApprovedMergeExecutionLease({
    review_approved_command: command(),
    live_head_sha: head,
    lease_id: `review-approved-merge-execution-pr-2:${head}`,
    spent_lease_ids: [],
    external_boundary: "comment",
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_merge_operation_boundary");
  assert.match(verdict.blockers.join("\n"), /comment/);
});
