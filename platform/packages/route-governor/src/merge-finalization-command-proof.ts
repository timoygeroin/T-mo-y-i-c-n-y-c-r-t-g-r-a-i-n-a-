import assert from "node:assert/strict";

import { compileMergeFinalizationCommand } from "./merge-finalization-command.js";
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
