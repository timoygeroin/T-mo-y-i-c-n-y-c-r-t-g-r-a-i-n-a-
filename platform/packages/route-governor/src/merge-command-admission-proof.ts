import assert from "node:assert/strict";

import { admitMergeCommand } from "./merge-command-admission.js";
import type { MergeReadinessVerdict } from "./merge-readiness.js";

const head = "49b306d41115c96012815b3b33c56572ceda149f";

const readiness: MergeReadinessVerdict = {
  ok: true,
  action: "merge_ready",
  repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
  pr_number: 2,
  branch: "monday-platform-genesis-01",
  head_sha: head,
  decisive_evidence: ["current-head status surface 27049651460", "approved by external-reviewer"],
  blockers: [],
  warnings: ["Node.js 20 Actions deprecation notice"],
  next_route: "request final review or merge through the authorized GitHub boundary",
};

const command = admitMergeCommand({
  readiness,
  live_head_sha: head,
  command_id: "merge-command-live-head-proof",
  merge_method: "squash",
  external_boundary: "github_pull_request_merge",
  spent_command_ids: [],
});

assert.equal(command.ok, true);
assert.equal(command.action, "compile_merge_command");
assert.equal(command.command?.operation, "merge_pull_request");
assert.equal(command.command?.expected_head_sha, head);

const stale = admitMergeCommand({
  readiness: { ...readiness, head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" },
  live_head_sha: head,
  command_id: "merge-command-stale-proof",
  merge_method: "squash",
  external_boundary: "github_pull_request_merge",
  spent_command_ids: [],
});

assert.equal(stale.ok, false);
assert.equal(stale.action, "block_stale_merge_head");

const unsafe = admitMergeCommand({
  readiness,
  live_head_sha: head,
  command_id: "merge-command-comment-proof",
  merge_method: "squash",
  external_boundary: "comment",
  spent_command_ids: [],
});

assert.equal(unsafe.ok, false);
assert.equal(unsafe.action, "block_unsafe_merge_boundary");

console.log("merge command admission proof passed");
