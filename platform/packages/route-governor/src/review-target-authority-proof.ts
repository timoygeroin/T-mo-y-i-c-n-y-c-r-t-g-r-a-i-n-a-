import assert from "node:assert/strict";

import { resolveReviewTargetAuthority, type ReviewTargetAuthorityInput } from "./review-target-authority.js";
import type { TerminalReviewHandoffVerdict } from "./terminal-review-handoff.js";

const head = "4ad710770b24946f2f7ccc95282bcd4b180fa63f";

function handoff(overrides: Partial<TerminalReviewHandoffVerdict> = {}): TerminalReviewHandoffVerdict {
  return {
    ok: true,
    action: "admit_review_request",
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch: "monday-platform-genesis-01",
    head_sha: head,
    decisive_evidence: [`live head ${head}`, "status surface current-head-readback"],
    blockers: [],
    quarantined_heads: ["b38ea247602ae8ebba80c4120ad03b41b26bd841"],
    warnings: ["Node.js 20 Actions deprecation notice"],
    next_route: "request final review on the live PR head",
    ...overrides,
  };
}

function input(overrides: Partial<ReviewTargetAuthorityInput> = {}): ReviewTargetAuthorityInput {
  return {
    handoff: handoff(),
    requested_reviewers: ["external-reviewer"],
    requested_team_reviewers: ["platform-review-team"],
    acting_user: "mondayid-bot",
    pr_author: "timoygeroin",
    target_set_id: `review-targets:${head}:01`,
    spent_target_set_ids: [],
    ...overrides,
  };
}

const admitted = resolveReviewTargetAuthority(input());
assert.equal(admitted.ok, true);
assert.equal(admitted.action, "admit_review_targets");
assert.deepEqual(admitted.reviewers, ["external-reviewer"]);
assert.deepEqual(admitted.team_reviewers, ["platform-review-team"]);
assert.equal(admitted.next_route, "compile the GitHub review request command only with this admitted target set and live-head guard");

const missingTarget = resolveReviewTargetAuthority(
  input({
    requested_reviewers: [],
    requested_team_reviewers: [],
    exact_blocker: "NO_REAL_REVIEW_TARGET_AVAILABLE_FOR_PR_2",
  }),
);
assert.equal(missingTarget.ok, false);
assert.equal(missingTarget.action, "emit_exact_review_target_blocker");
assert.deepEqual(missingTarget.blockers, ["NO_REAL_REVIEW_TARGET_AVAILABLE_FOR_PR_2"]);

const selfReview = resolveReviewTargetAuthority(input({ requested_reviewers: ["timoygeroin"] }));
assert.equal(selfReview.ok, false);
assert.equal(selfReview.action, "block_self_review_targets");

const placeholder = resolveReviewTargetAuthority(input({ requested_team_reviewers: ["platform-reviewer"] }));
assert.equal(placeholder.ok, false);
assert.equal(placeholder.action, "block_placeholder_targets");

const replay = resolveReviewTargetAuthority(input({ spent_target_set_ids: [`review-targets:${head}:01`] }));
assert.equal(replay.ok, false);
assert.equal(replay.action, "block_replayed_target_set");

console.log("review target authority proof passed");
