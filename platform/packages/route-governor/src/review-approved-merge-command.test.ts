import assert from "node:assert/strict";
import test from "node:test";

import { compileReviewApprovedMergeCommand } from "./review-approved-merge-command.js";
import type { MergeReadinessVerdict } from "./merge-readiness.js";
import type { ReviewResponseIntakeVerdict } from "./review-response-intake.js";

const head = "40fd60cc28d21e28b388bfc40f3e7db7bd54ddcf";

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

test("compiles a guarded merge command only after approval and merge readiness share the live head", () => {
  const verdict = compileReviewApprovedMergeCommand({
    review_intake: review(),
    merge_readiness: readiness(),
    live_head_sha: head,
    command_id: `review-approved-merge-pr-2:${head}`,
    spent_command_ids: [],
    external_boundary: "github_pull_request_merge",
    merge_method: "squash",
  });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "compile_review_approved_merge_command");
  assert.equal(verdict.command?.operation, "merge_pull_request");
  assert.equal(verdict.command?.head_sha, head);
  assert.equal(verdict.command?.guard.require_live_head_sha, head);
  assert.deepEqual(verdict.blockers, []);
});

test("blocks review responses that are not live-head approvals", () => {
  const changes = compileReviewApprovedMergeCommand({
    review_intake: review({
      ok: false,
      action: "route_to_review_repair",
      approvals: [],
      change_requests: ["external-reviewer"],
      blockers: ["review changes requested by external-reviewer"],
    }),
    merge_readiness: readiness(),
    live_head_sha: head,
    command_id: `review-approved-merge-pr-2:${head}`,
    spent_command_ids: [],
    external_boundary: "github_pull_request_merge",
    merge_method: "squash",
  });

  assert.equal(changes.ok, false);
  assert.equal(changes.action, "block_review_not_approved");
  assert.match(changes.blockers.join("\n"), /review changes requested/);

  const staleReview = compileReviewApprovedMergeCommand({
    review_intake: review({ head_sha: "stale-review-head" }),
    merge_readiness: readiness(),
    live_head_sha: head,
    command_id: `review-approved-merge-pr-2:${head}`,
    spent_command_ids: [],
    external_boundary: "github_pull_request_merge",
    merge_method: "squash",
  });

  assert.equal(staleReview.ok, false);
  assert.equal(staleReview.action, "block_stale_review_head");
});

test("blocks unready or stale merge readiness before command compilation", () => {
  const unready = compileReviewApprovedMergeCommand({
    review_intake: review(),
    merge_readiness: readiness({
      ok: false,
      action: "wait_for_checks",
      blockers: ["live status surface is pending"],
    }),
    live_head_sha: head,
    command_id: `review-approved-merge-pr-2:${head}`,
    spent_command_ids: [],
    external_boundary: "github_pull_request_merge",
    merge_method: "squash",
  });

  assert.equal(unready.ok, false);
  assert.equal(unready.action, "block_merge_readiness_not_ready");

  const staleReadiness = compileReviewApprovedMergeCommand({
    review_intake: review(),
    merge_readiness: readiness({ head_sha: "stale-readiness-head" }),
    live_head_sha: head,
    command_id: `review-approved-merge-pr-2:${head}`,
    spent_command_ids: [],
    external_boundary: "github_pull_request_merge",
    merge_method: "squash",
  });

  assert.equal(staleReadiness.ok, false);
  assert.equal(staleReadiness.action, "block_stale_readiness_head");
});

test("passes through merge command boundary blockers", () => {
  const verdict = compileReviewApprovedMergeCommand({
    review_intake: review(),
    merge_readiness: readiness(),
    live_head_sha: head,
    command_id: `review-approved-merge-pr-2:${head}`,
    spent_command_ids: [],
    external_boundary: "comment",
    merge_method: "squash",
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_merge_command_compile");
  assert.match(verdict.blockers.join("\n"), /comment/);
});
