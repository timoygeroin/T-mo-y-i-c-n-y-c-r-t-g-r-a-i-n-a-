import assert from "node:assert/strict";

import { admitMergeFinalizationExecution, compileMergeFinalizationCommand } from "./merge-finalization-command.js";
import type { MergeReadinessVerdict } from "./merge-readiness.js";

const head = "a0ff497316d618a8ac3f1d995a830daefee25e8c";

function readiness(overrides: Partial<MergeReadinessVerdict> = {}): MergeReadinessVerdict {
  return {
    ok: true,
    action: "merge_ready",
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch: "monday-platform-genesis-01",
    head_sha: head,
    decisive_evidence: [
      `current-head status surface ${head}`,
      "compileMergeReadiness",
      "mergeability true",
    ],
    blockers: [],
    warnings: ["Node.js 20 Actions deprecation notice is non-blocking"],
    next_route: "request final review or merge through the authorized GitHub boundary",
    ...overrides,
  };
}

function liveStatus(overrides = {}) {
  return {
    surface_id: "checks-live-head-a0ff4973",
    head_sha: head,
    verdict: "passing_with_warnings" as const,
    decisive_successes: ["Route Governor Proof succeeded", "Monday Platform CI succeeded"],
    blocking_failures: [],
    pending_surfaces: [],
    non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
    ...overrides,
  };
}

const command = compileMergeFinalizationCommand({
  readiness: readiness(),
  live_head_sha: head,
  command_id: "merge-finalization-live-head-001",
  spent_command_ids: [],
  external_boundary: "github_pull_request_merge",
  merge_method: "squash",
});

assert.equal(command.ok, true);
assert.equal(command.action, "compile_merge_command");
assert.equal(command.command?.operation, "merge_pull_request");
assert.equal(command.command?.guard.require_live_head_sha, head);
assert.deepEqual(command.blockers, []);

const stale = compileMergeFinalizationCommand({
  readiness: readiness({ head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }),
  live_head_sha: head,
  command_id: "merge-finalization-live-head-002",
  spent_command_ids: [],
  external_boundary: "github_pull_request_merge",
  merge_method: "squash",
});

assert.equal(stale.ok, false);
assert.equal(stale.action, "block_stale_merge_head");
assert.deepEqual(stale.blockers, [
  "merge readiness head b38ea247602ae8ebba80c4120ad03b41b26bd841 is not live head a0ff497316d618a8ac3f1d995a830daefee25e8c",
]);

const wrongBoundary = compileMergeFinalizationCommand({
  readiness: readiness(),
  live_head_sha: head,
  command_id: "merge-finalization-live-head-003",
  spent_command_ids: [],
  external_boundary: "comment",
  merge_method: "squash",
});

assert.equal(wrongBoundary.ok, false);
assert.equal(wrongBoundary.action, "block_external_boundary");

const repeated = compileMergeFinalizationCommand({
  readiness: readiness(),
  live_head_sha: head,
  command_id: "merge-finalization-live-head-001",
  spent_command_ids: ["merge-finalization-live-head-001"],
  external_boundary: "github_pull_request_merge",
  merge_method: "squash",
});

assert.equal(repeated.ok, false);
assert.equal(repeated.action, "block_repeated_command");

assert.ok(command.command);

const admittedExecution = admitMergeFinalizationExecution({
  command: command.command,
  active_branch: "monday-platform-genesis-01",
  live_head_sha: head,
  draft: false,
  mergeable: true,
  required_approval_count: 1,
  approval_count: 1,
  external_boundary: "github_pull_request_merge",
  status_surface: liveStatus(),
  promoted_surface_ids: ["merge-finalization-command-public-surface", "merge-result-receipt-public-surface"],
  spent_command_ids: [],
});

assert.equal(admittedExecution.ok, true);
assert.equal(admittedExecution.action, "admit_merge_execution");
assert.equal(admittedExecution.command?.command_id, "merge-finalization-live-head-001");
assert.deepEqual(admittedExecution.blockers, []);

const staleExecutionHead = admitMergeFinalizationExecution({
  command: { ...command.command, head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" },
  active_branch: "monday-platform-genesis-01",
  live_head_sha: head,
  draft: false,
  mergeable: true,
  required_approval_count: 1,
  approval_count: 1,
  external_boundary: "github_pull_request_merge",
  status_surface: liveStatus(),
  promoted_surface_ids: ["merge-finalization-command-public-surface", "merge-result-receipt-public-surface"],
  spent_command_ids: [],
});

assert.equal(staleExecutionHead.ok, false);
assert.equal(staleExecutionHead.action, "block_stale_merge_head");

const pendingExecutionStatus = admitMergeFinalizationExecution({
  command: command.command,
  active_branch: "monday-platform-genesis-01",
  live_head_sha: head,
  draft: false,
  mergeable: true,
  required_approval_count: 1,
  approval_count: 1,
  external_boundary: "github_pull_request_merge",
  status_surface: liveStatus({ verdict: "pending" as const, decisive_successes: [], pending_surfaces: ["Route Governor Proof pending"] }),
  promoted_surface_ids: ["merge-finalization-command-public-surface", "merge-result-receipt-public-surface"],
  spent_command_ids: [],
});

assert.equal(pendingExecutionStatus.ok, false);
assert.equal(pendingExecutionStatus.action, "block_status_not_passing");
assert.ok(pendingExecutionStatus.blockers.some((blocker) => blocker.includes("pending")));

const missingExecutionApproval = admitMergeFinalizationExecution({
  command: command.command,
  active_branch: "monday-platform-genesis-01",
  live_head_sha: head,
  draft: false,
  mergeable: true,
  required_approval_count: 1,
  approval_count: 0,
  external_boundary: "github_pull_request_merge",
  status_surface: liveStatus(),
  promoted_surface_ids: ["merge-finalization-command-public-surface", "merge-result-receipt-public-surface"],
  spent_command_ids: [],
});

assert.equal(missingExecutionApproval.ok, false);
assert.equal(missingExecutionApproval.action, "block_missing_review_approval");

const missingExecutionSurface = admitMergeFinalizationExecution({
  command: command.command,
  active_branch: "monday-platform-genesis-01",
  live_head_sha: head,
  draft: false,
  mergeable: true,
  required_approval_count: 1,
  approval_count: 1,
  external_boundary: "github_pull_request_merge",
  status_surface: liveStatus(),
  promoted_surface_ids: ["merge-finalization-command-public-surface"],
  spent_command_ids: [],
});

assert.equal(missingExecutionSurface.ok, false);
assert.equal(missingExecutionSurface.action, "block_missing_finalization_surface");
assert.ok(missingExecutionSurface.blockers.some((blocker) => blocker.includes("merge-result-receipt-public-surface")));

const wrongExecutionBoundary = admitMergeFinalizationExecution({
  command: command.command,
  active_branch: "monday-platform-genesis-01",
  live_head_sha: head,
  draft: false,
  mergeable: true,
  required_approval_count: 1,
  approval_count: 1,
  external_boundary: "comment",
  status_surface: liveStatus(),
  promoted_surface_ids: ["merge-finalization-command-public-surface", "merge-result-receipt-public-surface"],
  spent_command_ids: [],
});

assert.equal(wrongExecutionBoundary.ok, false);
assert.equal(wrongExecutionBoundary.action, "block_external_boundary");