import assert from "node:assert/strict";

import { admitMergeAttempt } from "./merge-attempt-admission.js";

const liveHead = "01616aa1fa7fc5a89357e4be551d074a24e54f66";
const repository = "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-";
const branch = "monday-platform-genesis-01";

const admitted = admitMergeAttempt({
  repository_full_name: repository,
  pr_number: 2,
  branch,
  live_head_sha: liveHead,
  command_head_sha: liveHead,
  status_head_sha: liveHead,
  status_verdict: "passing_with_warnings",
  review_head_sha: liveHead,
  approvals: ["external-reviewer"],
  change_requests: [],
  required_approval_count: 1,
  mergeability_head_sha: liveHead,
  mergeable: true,
  attempt_id: `merge-attempt-${liveHead}`,
  spent_attempt_ids: [],
});

assert.equal(admitted.ok, true);
assert.equal(admitted.action, "admit_merge_attempt");
assert.equal(admitted.next_route, "issue the merge command only with expected_head_sha bound to this live head");

const staleStatus = admitMergeAttempt({
  repository_full_name: repository,
  pr_number: 2,
  branch,
  live_head_sha: liveHead,
  command_head_sha: liveHead,
  status_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
  status_verdict: "passing",
  review_head_sha: liveHead,
  approvals: ["external-reviewer"],
  change_requests: [],
  required_approval_count: 1,
  mergeability_head_sha: liveHead,
  mergeable: true,
  attempt_id: `merge-attempt-stale-status-${liveHead}`,
  spent_attempt_ids: [],
});

assert.equal(staleStatus.ok, false);
assert.equal(staleStatus.action, "block_stale_status_head");

const missingReview = admitMergeAttempt({
  repository_full_name: repository,
  pr_number: 2,
  branch,
  live_head_sha: liveHead,
  command_head_sha: liveHead,
  status_head_sha: liveHead,
  status_verdict: "passing_with_warnings",
  review_head_sha: liveHead,
  approvals: [],
  change_requests: [],
  required_approval_count: 1,
  mergeability_head_sha: liveHead,
  mergeable: true,
  attempt_id: `merge-attempt-missing-review-${liveHead}`,
  spent_attempt_ids: [],
});

assert.equal(missingReview.ok, false);
assert.equal(missingReview.action, "block_review_not_approved");
