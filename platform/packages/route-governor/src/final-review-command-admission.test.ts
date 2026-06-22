import test from "node:test";
import assert from "node:assert/strict";
import {
  admitFinalReviewCommand,
  type FinalReviewCommandAdmissionInput,
} from "./final-review-command-admission.js";

const baseInput: FinalReviewCommandAdmissionInput = {
  active_branch: "monday-platform-genesis-01",
  live_head_sha: "head-1",
  command_id: "cmd-1",
  spent_command_ids: [],
  desired_command: "request_final_review",
  status: {
    surface_id: "status-1",
    branch: "monday-platform-genesis-01",
    head_sha: "head-1",
    kind: "passing_with_warnings",
    blockers: [],
    warnings: ["node20 deprecation warning"],
    evidence: ["seven required checks passed"],
  },
  mergeability: {
    surface_id: "mergeable-1",
    branch: "monday-platform-genesis-01",
    head_sha: "head-1",
    kind: "mergeable",
    blockers: [],
    evidence: ["PR is mergeable"],
  },
  review: {
    surface_id: "review-1",
    branch: "monday-platform-genesis-01",
    head_sha: "head-1",
    kind: "none",
    reviewer_logins: ["reviewer-a"],
    blockers: [],
    evidence: ["review not yet requested"],
  },
  blocker_surface: {
    surface_id: "blockers-1",
    branch: "monday-platform-genesis-01",
    head_sha: "head-1",
    open_blockers: [],
    evidence: ["status-readback blocker retired"],
  },
};

test("admits one final review request when live-head surfaces are clean", () => {
  const verdict = admitFinalReviewCommand(baseInput);

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_review_request_command");
  assert.deepEqual(verdict.blockers, []);
  assert.deepEqual(verdict.warnings, ["node20 deprecation warning"]);
});

test("blocks stale status before issuing review commands", () => {
  const verdict = admitFinalReviewCommand({
    ...baseInput,
    status: { ...baseInput.status, head_sha: "old-head" },
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_head_mismatch");
  assert.match(verdict.blockers[0], /old-head/);
});

test("blocks duplicate command ids", () => {
  const verdict = admitFinalReviewCommand({
    ...baseInput,
    spent_command_ids: ["cmd-1"],
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_reused_command");
});

test("blocks pending status before final review request", () => {
  const verdict = admitFinalReviewCommand({
    ...baseInput,
    status: { ...baseInput.status, kind: "pending" },
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_pending_status");
});

test("blocks review request replay while review is already pending", () => {
  const verdict = admitFinalReviewCommand({
    ...baseInput,
    review: { ...baseInput.review, kind: "requested" },
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_review_pending");
});

test("admits merge finalization only after live-head approval", () => {
  const verdict = admitFinalReviewCommand({
    ...baseInput,
    command_id: "cmd-merge-1",
    desired_command: "merge_finalization",
    review: { ...baseInput.review, kind: "approved", evidence: ["approval recorded"] },
  });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_merge_finalization_command");
});

test("blocks merge finalization without approval", () => {
  const verdict = admitFinalReviewCommand({
    ...baseInput,
    command_id: "cmd-merge-2",
    desired_command: "merge_finalization",
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_approval");
});

test("admits exact blocker as the only terminal command when named", () => {
  const verdict = admitFinalReviewCommand({
    ...baseInput,
    command_id: "cmd-blocker-1",
    desired_command: "exact_external_blocker",
    exact_blocker: "REVIEWER_AUTHORITY_MISSING",
  });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "emit_exact_external_blocker");
  assert.deepEqual(verdict.blockers, ["REVIEWER_AUTHORITY_MISSING"]);
});
