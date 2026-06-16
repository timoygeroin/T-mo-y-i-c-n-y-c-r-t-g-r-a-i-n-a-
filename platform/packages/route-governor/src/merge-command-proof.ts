import assert from "node:assert/strict";

import { compileMergeCommand, type MergeCommandInput } from "./merge-command.js";
import type { TerminalReviewHandoffVerdict } from "./terminal-review-handoff.js";

const head = "0798fa1324977211dc4e04c1f663abfd0773fbab";
const staleHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function handoff(overrides: Partial<TerminalReviewHandoffVerdict> = {}): TerminalReviewHandoffVerdict {
  return {
    ok: true,
    action: "admit_merge",
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch: "monday-platform-genesis-01",
    head_sha: head,
    decisive_evidence: [
      `live head ${head}`,
      "status surface live-head-readback-0798fa",
      "merge readiness admitted this head",
    ],
    blockers: [],
    quarantined_heads: [staleHead],
    warnings: ["Node.js 20 Actions deprecation notice"],
    next_route: "merge only through the authorized GitHub boundary",
    ...overrides,
  };
}

function input(overrides: Partial<MergeCommandInput> = {}): MergeCommandInput {
  return {
    handoff: handoff(),
    live_head_sha: head,
    merge_method: "squash",
    command_id: `merge-pr-2:${head}`,
    spent_command_ids: [],
    external_boundary: "github_pull_request_merge",
    ...overrides,
  };
}

const compiled = compileMergeCommand(input());
assert.equal(compiled.ok, true);
assert.equal(compiled.action, "compile_merge_command");
assert.equal(compiled.command?.operation, "merge_pull_request");
assert.equal(compiled.command?.expected_head_sha, head);
assert.equal(compiled.command?.guard.require_live_head_sha, head);
assert.equal(compiled.command?.guard.require_handoff_action, "admit_merge");
assert(compiled.command?.guard.forbidden_fallbacks.includes("unguarded_merge"));

const wrongBoundary = compileMergeCommand(input({ external_boundary: "local_memory" }));
assert.equal(wrongBoundary.ok, false);
assert.equal(wrongBoundary.action, "block_external_boundary");

const unadmitted = compileMergeCommand(
  input({
    handoff: handoff({
      ok: false,
      action: "block_incomplete_readiness",
      blockers: ["required review approval has not surfaced on the live head"],
    }),
  }),
);
assert.equal(unadmitted.ok, false);
assert.equal(unadmitted.action, "block_unadmitted_handoff");

const stale = compileMergeCommand(input({ handoff: handoff({ head_sha: staleHead }) }));
assert.equal(stale.ok, false);
assert.equal(stale.action, "block_stale_handoff_head");

const repeated = compileMergeCommand(input({ spent_command_ids: [`merge-pr-2:${head}`] }));
assert.equal(repeated.ok, false);
assert.equal(repeated.action, "block_repeated_command");

console.log("merge command proof passed");
