import test from "node:test";
import assert from "node:assert/strict";

import { admitMergeAttempt, type MergeAttemptAdmissionInput } from "./merge-attempt-admission.js";

const head = "01616aa1fa7fc5a89357e4be551d074a24e54f66";

function input(overrides: Partial<MergeAttemptAdmissionInput> = {}): MergeAttemptAdmissionInput {
  return {
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch: "monday-platform-genesis-01",
    live_head_sha: head,
    command_head_sha: head,
    status_head_sha: head,
    status_verdict: "passing_with_warnings",
    review_head_sha: head,
    approvals: ["external-reviewer"],
    change_requests: [],
    required_approval_count: 1,
    mergeability_head_sha: head,
    mergeable: true,
    attempt_id: `merge-attempt-${head}`,
    spent_attempt_ids: [],
    ...overrides,
  };
}

test("admits a merge attempt only after live-head status, review, and mergeability converge", () => {
  const verdict = admitMergeAttempt(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_merge_attempt");
  assert.equal(verdict.head_sha, head);
  assert.equal(verdict.next_route, "issue the merge command only with expected_head_sha bound to this live head");
});

test("blocks stale merge commands", () => {
  const verdict = admitMergeAttempt(input({ command_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_command_head");
  assert.deepEqual(verdict.blockers, [
    `merge command head b38ea247602ae8ebba80c4120ad03b41b26bd841 is not live head ${head}`,
  ]);
});

test("blocks stale or failing status authority", () => {
  const stale = admitMergeAttempt(input({ status_head_sha: "3bf8e07dce32e59accf776357fb22278f57ba3f5" }));
  assert.equal(stale.ok, false);
  assert.equal(stale.action, "block_stale_status_head");

  const failing = admitMergeAttempt(input({ status_verdict: "failing" }));
  assert.equal(failing.ok, false);
  assert.equal(failing.action, "block_status_not_passing");
  assert.deepEqual(failing.blockers, ["status verdict is failing"]);
});

test("blocks stale or insufficient review authority", () => {
  const stale = admitMergeAttempt(input({ review_head_sha: "3bf8e07dce32e59accf776357fb22278f57ba3f5" }));
  assert.equal(stale.ok, false);
  assert.equal(stale.action, "block_stale_review_head");

  const missing = admitMergeAttempt(input({ approvals: [], required_approval_count: 1 }));
  assert.equal(missing.ok, false);
  assert.equal(missing.action, "block_review_not_approved");
  assert.deepEqual(missing.blockers, ["required approvals 0/1 have surfaced on the live head"]);

  const requestedChanges = admitMergeAttempt(input({ change_requests: ["external-reviewer"] }));
  assert.equal(requestedChanges.ok, false);
  assert.equal(requestedChanges.action, "block_review_not_approved");
  assert.deepEqual(requestedChanges.blockers, ["changes requested by external-reviewer"]);
});

test("blocks stale, false, or unknown mergeability", () => {
  const stale = admitMergeAttempt(input({ mergeability_head_sha: "3bf8e07dce32e59accf776357fb22278f57ba3f5" }));
  assert.equal(stale.ok, false);
  assert.equal(stale.action, "block_mergeability_not_current");

  const falseMergeability = admitMergeAttempt(input({ mergeable: false }));
  assert.equal(falseMergeability.ok, false);
  assert.equal(falseMergeability.action, "block_mergeability_false");
  assert.deepEqual(falseMergeability.blockers, ["mergeable is false"]);

  const unknown = admitMergeAttempt(input({ mergeable: null }));
  assert.equal(unknown.ok, false);
  assert.equal(unknown.action, "block_mergeability_false");
  assert.deepEqual(unknown.blockers, ["mergeable is unknown"]);
});

test("blocks repeated merge attempt ids", () => {
  const attemptId = `merge-attempt-${head}`;
  const verdict = admitMergeAttempt(input({ attempt_id: attemptId, spent_attempt_ids: [attemptId] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_repeated_attempt");
  assert.deepEqual(verdict.blockers, [`merge attempt id already spent: ${attemptId}`]);
});
