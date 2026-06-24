import assert from "node:assert/strict";

import { intakeReviewTargets, type ReviewTargetIntakeInput } from "./review-target-intake.js";

function input(overrides: Partial<ReviewTargetIntakeInput> = {}): ReviewTargetIntakeInput {
  return {
    intake_id: "review-target-intake-live-head-001",
    repository_owner: "timoygeroin",
    pr_author: "timoygeroin",
    candidate_reviewers: ["external-reviewer", "external-reviewer"],
    candidate_team_reviewers: [],
    placeholder_targets: ["platform-reviewer", "reviewer", "todo", "tbd", "example-reviewer"],
    spent_intake_ids: [],
    ...overrides,
  };
}

const admitted = intakeReviewTargets(input());
assert.equal(admitted.ok, true);
assert.equal(admitted.action, "admit_external_review_targets");
assert.deepEqual(admitted.reviewers, ["external-reviewer"]);
assert.deepEqual(admitted.team_reviewers, []);
assert.ok(admitted.decisive_evidence.includes("external reviewer:external-reviewer"));

const teamAdmitted = intakeReviewTargets(
  input({ candidate_reviewers: ["timoygeroin"], candidate_team_reviewers: ["platform-review-team"] }),
);
assert.equal(teamAdmitted.ok, true);
assert.equal(teamAdmitted.action, "admit_external_review_targets");
assert.deepEqual(teamAdmitted.reviewers, ["timoygeroin"]);
assert.deepEqual(teamAdmitted.team_reviewers, ["platform-review-team"]);

const missing = intakeReviewTargets(input({ candidate_reviewers: [], candidate_team_reviewers: [] }));
assert.equal(missing.ok, false);
assert.equal(missing.action, "block_missing_review_targets");
assert.deepEqual(missing.blockers, ["review target intake has no reviewer or team reviewer target"]);

const placeholder = intakeReviewTargets(input({ candidate_reviewers: ["platform-reviewer"] }));
assert.equal(placeholder.ok, false);
assert.equal(placeholder.action, "block_placeholder_review_targets");
assert.deepEqual(placeholder.blockers, ["review target is a placeholder: platform-reviewer"]);

const selfOnly = intakeReviewTargets(input({ candidate_reviewers: ["timoygeroin"], candidate_team_reviewers: [] }));
assert.equal(selfOnly.ok, false);
assert.equal(selfOnly.action, "block_self_only_review_targets");
assert.deepEqual(selfOnly.blockers, ["review target is self-only: timoygeroin"]);

const spent = intakeReviewTargets(input({ spent_intake_ids: ["review-target-intake-live-head-001"] }));
assert.equal(spent.ok, false);
assert.equal(spent.action, "block_spent_target_intake");

console.log("review target intake proof passed");
