import assert from "node:assert/strict";

import { compilePostRepairMergeHandoff } from "./post-repair-merge-handoff.js";

const branch = "monday-platform-genesis-01";
const liveHead = "f158385f1ce6c81ef7d38a6c6f69161423287291";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const statusSurface = {
  surface_id: "checks:f158385f",
  head_sha: liveHead,
  verdict: "passing_with_warnings" as const,
  decisive_successes: [
    "Monday Platform CI succeeded",
    "Monday Platform Route Governor succeeded",
    "Route Governor Proof succeeded",
  ],
  blockers: [],
  warnings: ["Node.js 20 Actions deprecation notice"],
};

const review = compilePostRepairMergeHandoff({
  repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
  pr_number: 2,
  active_branch: branch,
  candidate_branch: branch,
  live_head_sha: liveHead,
  repaired_head_sha: repairedHead,
  last_status_readback_head_sha: repairedHead,
  resolved_blocker_ids: ["issue-1-ci-status-readback"],
  draft: false,
  mergeable: true,
  requested_intent: "request_review",
  status_surface: statusSurface,
  required_approval_count: 1,
  approval_count: 0,
});

assert.equal(review.ok, true);
assert.equal(review.action, "admit_review_handoff");
assert.deepEqual(review.blockers, []);
assert.ok(review.retired_heads.includes(repairedHead));
assert.ok(review.warnings.includes("Node.js 20 Actions deprecation notice"));

const warningMaintenance = compilePostRepairMergeHandoff({
  ...review,
  active_branch: branch,
  candidate_branch: branch,
  live_head_sha: liveHead,
  repaired_head_sha: repairedHead,
  last_status_readback_head_sha: repairedHead,
  resolved_blocker_ids: ["issue-1-ci-status-readback"],
  draft: false,
  mergeable: true,
  requested_intent: "warning_maintenance",
  status_surface: statusSurface,
  required_approval_count: 1,
  approval_count: 0,
});

assert.equal(warningMaintenance.ok, false);
assert.equal(warningMaintenance.action, "block_warning_maintenance");

const staleStatus = compilePostRepairMergeHandoff({
  repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
  pr_number: 2,
  active_branch: branch,
  candidate_branch: branch,
  live_head_sha: liveHead,
  repaired_head_sha: repairedHead,
  last_status_readback_head_sha: repairedHead,
  resolved_blocker_ids: ["issue-1-ci-status-readback"],
  draft: false,
  mergeable: true,
  requested_intent: "request_review",
  status_surface: { ...statusSurface, surface_id: "checks:repaired-head", head_sha: repairedHead },
  required_approval_count: 1,
  approval_count: 0,
});

assert.equal(staleStatus.ok, false);
assert.equal(staleStatus.action, "block_stale_status_surface");

const merge = compilePostRepairMergeHandoff({
  repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
  pr_number: 2,
  active_branch: branch,
  candidate_branch: branch,
  live_head_sha: liveHead,
  repaired_head_sha: repairedHead,
  last_status_readback_head_sha: repairedHead,
  resolved_blocker_ids: ["issue-1-ci-status-readback"],
  draft: false,
  mergeable: true,
  requested_intent: "merge",
  status_surface: statusSurface,
  required_approval_count: 1,
  approval_count: 1,
});

assert.equal(merge.ok, true);
assert.equal(merge.action, "admit_merge_handoff");
assert.ok(merge.decisive_evidence.includes("approvals 1"));

console.log("post-repair merge handoff proof passed");
