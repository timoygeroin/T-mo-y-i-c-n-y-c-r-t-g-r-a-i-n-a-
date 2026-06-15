import assert from "node:assert/strict";

import { enforceReviewTargetPolicy, type ReviewTargetPolicyInput } from "./review-target-policy.js";

const liveHead = "5b73afa7d030b226dd0401f703f5510ef2371138";
const oldHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function input(overrides: Partial<ReviewTargetPolicyInput> = {}): ReviewTargetPolicyInput {
  return {
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    command_head_sha: liveHead,
    pr_author: "timoygeroin",
    requested_reviewers: ["external-reviewer"],
    requested_team_reviewers: [],
    spent_target_sets: [],
    ...overrides,
  };
}

const admitted = enforceReviewTargetPolicy(input({ requested_reviewers: [" external-reviewer ", "external-reviewer"] }));
assert.equal(admitted.ok, true);
assert.equal(admitted.action, "admit_external_review_targets");
assert.deepEqual(admitted.reviewers, ["external-reviewer"]);
assert.equal(admitted.target_set_id, `${liveHead ? `monday-platform-genesis-01@${liveHead}|user:external-reviewer|` : ""}`);
assert(admitted.decisive_evidence.includes("reviewer:external-reviewer"));

const staleHead = enforceReviewTargetPolicy(input({ command_head_sha: oldHead }));
assert.equal(staleHead.ok, false);
assert.equal(staleHead.action, "block_stale_command_head");
assert.deepEqual(staleHead.blockers, [`review target command head ${oldHead} is not live head ${liveHead}`]);

const missingTargets = enforceReviewTargetPolicy(input({ requested_reviewers: [], requested_team_reviewers: [] }));
assert.equal(missingTargets.ok, false);
assert.equal(missingTargets.action, "block_missing_review_targets");

const placeholder = enforceReviewTargetPolicy(input({ requested_reviewers: ["platform-reviewer"] }));
assert.equal(placeholder.ok, false);
assert.equal(placeholder.action, "block_placeholder_review_targets");
assert.deepEqual(placeholder.blockers, ["review target is a placeholder: platform-reviewer"]);

const selfReview = enforceReviewTargetPolicy(input({ requested_reviewers: ["TIMOYGEROIN"] }));
assert.equal(selfReview.ok, false);
assert.equal(selfReview.action, "block_author_self_review");
assert.deepEqual(selfReview.blockers, ["review target is the PR author: TIMOYGEROIN"]);

const repeated = enforceReviewTargetPolicy(
  input({ spent_target_sets: [`monday-platform-genesis-01@${liveHead}|user:external-reviewer|`] }),
);
assert.equal(repeated.ok, false);
assert.equal(repeated.action, "block_repeated_target_set");

const teamTarget = enforceReviewTargetPolicy(input({ requested_reviewers: [], requested_team_reviewers: ["platform-reviewers"] }));
assert.equal(teamTarget.ok, true);
assert.deepEqual(teamTarget.team_reviewers, ["platform-reviewers"]);
assert.equal(teamTarget.target_set_id, `monday-platform-genesis-01@${liveHead}||team:platform-reviewers`);
