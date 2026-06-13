import assert from "node:assert/strict";

import {
  compileReviewHandoffReadiness,
  type ReviewHandoffReadinessInput,
  type ReviewHandoffStatusSurface,
} from "./review-handoff-readiness.js";

const repository = "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-";
const branch = "monday-platform-genesis-01";
const liveHead = "385b410ca1164e26acd4ac321b74348af151d7d6";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function status(overrides: Partial<ReviewHandoffStatusSurface> = {}): ReviewHandoffStatusSurface {
  return {
    surface_id: "checks:live-head-385b410",
    head_sha: liveHead,
    verdict: "passing_with_warnings",
    decisive_successes: ["Route governor proof examples passed for live head"],
    blocking_failures: [],
    pending_surfaces: [],
    non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
    ...overrides,
  };
}

function input(overrides: Partial<ReviewHandoffReadinessInput> = {}): ReviewHandoffReadinessInput {
  return {
    repository_full_name: repository,
    pr_number: 2,
    active_branch: branch,
    branch,
    live_head_sha: liveHead,
    draft: false,
    mergeable: true,
    status_surface: status(),
    blocker_receipts: [
      {
        blocker_id: "issue-1-ci-status-readback",
        head_sha: repairedHead,
        state: "closed",
        resolution: "repaired-head checks passed and issue was closed",
      },
    ],
    evidence: {
      executable_artifacts: ["compileReviewHandoffReadiness"],
      routing_artifacts: ["review handoff readiness compiler"],
      review_surface_ids: ["pull-request:2"],
    },
    ...overrides,
  };
}

const admitted = compileReviewHandoffReadiness(input());
assert.equal(admitted.ok, true);
assert.equal(admitted.action, "admit_review_handoff");
assert.equal(admitted.warnings.length, 1);

const missingStatus = compileReviewHandoffReadiness(input({ status_surface: undefined }));
assert.equal(missingStatus.ok, true);
assert.equal(missingStatus.action, "read_live_head_status");

const staleStatus = compileReviewHandoffReadiness(input({ status_surface: status({ head_sha: repairedHead }) }));
assert.equal(staleStatus.ok, false);
assert.equal(staleStatus.action, "block_stale_status_surface");

const failingStatus = compileReviewHandoffReadiness(
  input({
    status_surface: status({
      verdict: "failing",
      decisive_successes: [],
      blocking_failures: ["Route governor proof examples failed for live head"],
    }),
  }),
);
assert.equal(failingStatus.ok, false);
assert.equal(failingStatus.action, "repair_live_head_failure");

const liveBlocker = compileReviewHandoffReadiness(
  input({
    blocker_receipts: [{ blocker_id: "current-head-proof-failure", head_sha: liveHead, state: "open" }],
  }),
);
assert.equal(liveBlocker.ok, false);
assert.equal(liveBlocker.action, "block_unretired_blocker");

const draft = compileReviewHandoffReadiness(input({ draft: true }));
assert.equal(draft.ok, false);
assert.equal(draft.action, "block_draft_pr");

const missingEvidence = compileReviewHandoffReadiness(
  input({
    evidence: {
      executable_artifacts: [],
      routing_artifacts: [],
      review_surface_ids: [],
    },
  }),
);
assert.equal(missingEvidence.ok, false);
assert.equal(missingEvidence.action, "block_missing_review_evidence");

console.log("review handoff readiness proof passed");
