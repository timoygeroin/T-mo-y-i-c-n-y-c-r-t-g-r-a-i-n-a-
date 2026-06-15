import test from "node:test";
import assert from "node:assert/strict";

import { intakeReviewTargets, type ReviewTargetIntakeInput } from "./review-target-intake.js";

function input(overrides: Partial<ReviewTargetIntakeInput> = {}): ReviewTargetIntakeInput {
  return {
    intake_id: "review-target-intake-test",
    repository_owner: "timoygeroin",
    pr_author: "timoygeroin",
    candidate_reviewers: ["external-reviewer"],
    candidate_team_reviewers: [],
    placeholder_targets: ["platform-reviewer", "reviewer", "todo", "tbd", "example-reviewer"],
    spent_intake_ids: [],
    ...overrides,
  };
}

test("admits concrete external reviewer targets", () => {
  const verdict = intakeReviewTargets(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_external_review_targets");
  assert.deepEqual(verdict.reviewers, ["external-reviewer"]);
});

test("admits team targets even when the only user target is the PR author", () => {
  const verdict = intakeReviewTargets(
    input({ candidate_reviewers: ["timoygeroin"], candidate_team_reviewers: ["platform-review-team"] }),
  );

  assert.equal(verdict.ok, true);
  assert.deepEqual(verdict.team_reviewers, ["platform-review-team"]);
});

test("blocks missing, placeholder, self-only, and spent review-target intakes", () => {
  assert.equal(
    intakeReviewTargets(input({ candidate_reviewers: [], candidate_team_reviewers: [] })).action,
    "block_missing_review_targets",
  );
  assert.equal(
    intakeReviewTargets(input({ candidate_reviewers: ["platform-reviewer"] })).action,
    "block_placeholder_review_targets",
  );
  assert.equal(
    intakeReviewTargets(input({ candidate_reviewers: ["timoygeroin"] })).action,
    "block_self_only_review_targets",
  );
  assert.equal(
    intakeReviewTargets(input({ spent_intake_ids: ["review-target-intake-test"] })).action,
    "block_spent_target_intake",
  );
});
