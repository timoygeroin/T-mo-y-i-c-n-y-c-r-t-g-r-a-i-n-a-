import assert from "node:assert/strict";

import {
  admitTerminalMergeFinalization,
  type TerminalMergeAdmissionInput,
} from "./terminal-merge-admission.js";

const branch = "monday-platform-genesis-01";
const head = "e67e3cf361fe293a7faac6bf4c10c421c9f0d71f";

function input(overrides: Partial<TerminalMergeAdmissionInput> = {}): TerminalMergeAdmissionInput {
  return {
    admission_id: "terminal-merge-admission-live-head-001",
    spent_admission_ids: [],
    command_id: "merge-finalization-live-head-001",
    spent_command_ids: [],
    active_branch: branch,
    live_head_sha: head,
    review: {
      ok: true,
      action: "route_to_merge_gate",
      repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
      pr_number: 2,
      branch,
      head_sha: head,
      approvals: ["external-reviewer"],
      change_requests: [],
      pending_reviewers: [],
      decisive_evidence: [`review approval accepted on ${head}`],
      blockers: [],
      next_route: "enter merge gate only after live-head status and mergeability are still current",
    },
    status: {
      ok: true,
      action: "accept_live_status_evidence",
      branch,
      head_sha: head,
      accepted_surface_ids: ["checks-live-head-e67"],
      stale_surface_ids: ["checks-repaired-head-b38"],
      summary_surface_ids: ["prompt-carried-repaired-head"],
      decisive_evidence: [`checks-live-head-e67:check_run:passing_with_warnings`, "Route governor proof examples succeeded"],
      blockers: [],
      warnings: ["Node.js 20 Actions deprecation notice"],
      next_route: "continue from live-head-bound status evidence without inheriting stale prompt or PR-body summaries",
    },
    readiness: {
      ok: true,
      action: "merge_ready",
      repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
      pr_number: 2,
      branch,
      head_sha: head,
      decisive_evidence: ["current-head status surface checks-live-head-e67", "compileMergeReadiness"],
      blockers: [],
      warnings: ["Node.js 20 Actions deprecation notice"],
      next_route: "request final review or merge through the authorized GitHub boundary; do not add another embodiment guard unless a new blocker appears",
    },
    merge_method: "squash",
    ...overrides,
  };
}

const admitted = admitTerminalMergeFinalization(input());
assert.equal(admitted.ok, true);
assert.equal(admitted.action, "admit_merge_finalization");
assert.equal(admitted.admission_id, "terminal-merge-admission-live-head-001");
assert.equal(admitted.command_input?.external_boundary, "github_pull_request_merge");
assert.equal(admitted.command_input?.live_head_sha, head);
assert.equal(admitted.warnings.length, 2);

const staleReview = admitTerminalMergeFinalization(
  input({
    review: {
      ok: true,
      action: "route_to_merge_gate",
      repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
      pr_number: 2,
      branch,
      head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
      approvals: ["external-reviewer"],
      change_requests: [],
      pending_reviewers: [],
      decisive_evidence: ["stale repaired-head review approval"],
      blockers: [],
      next_route: "stale route should not survive",
    },
  }),
);
assert.equal(staleReview.ok, false);
assert.equal(staleReview.action, "block_stale_review_head");

const unapprovedReview = admitTerminalMergeFinalization(
  input({
    review: {
      ok: false,
      action: "wait_for_review_response",
      repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
      pr_number: 2,
      branch,
      head_sha: head,
      approvals: [],
      change_requests: [],
      pending_reviewers: ["external-reviewer"],
      decisive_evidence: [`live head ${head}`],
      blockers: ["required review approval has not surfaced on the live head"],
      next_route: "wait for live-head review response",
    },
  }),
);
assert.equal(unapprovedReview.ok, false);
assert.equal(unapprovedReview.action, "block_review_not_approved");

const summaryStatus = admitTerminalMergeFinalization(
  input({
    status: {
      ok: false,
      action: "block_summary_as_status",
      branch,
      head_sha: head,
      accepted_surface_ids: [],
      stale_surface_ids: [],
      summary_surface_ids: ["pr-body-summary"],
      decisive_evidence: [],
      blockers: ["summary surface cannot prove live-head status: pr-body-summary"],
      warnings: [],
      next_route: "obtain direct live-head status evidence",
    },
  }),
);
assert.equal(summaryStatus.ok, false);
assert.equal(summaryStatus.action, "block_status_not_accepted");

const repeatedAdmission = admitTerminalMergeFinalization(
  input({ spent_admission_ids: ["terminal-merge-admission-live-head-001"] }),
);
assert.equal(repeatedAdmission.ok, false);
assert.equal(repeatedAdmission.action, "block_replayed_admission");
