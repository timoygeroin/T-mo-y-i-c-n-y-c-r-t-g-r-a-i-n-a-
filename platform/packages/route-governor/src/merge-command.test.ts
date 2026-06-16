import assert from "node:assert/strict";
import { test } from "node:test";

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

test("compiles a guarded GitHub merge command from admitted merge handoff", () => {
  const verdict = compileMergeCommand(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "compile_merge_command");
  assert.equal(verdict.command?.operation, "merge_pull_request");
  assert.equal(verdict.command?.repository_full_name, "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-");
  assert.equal(verdict.command?.pr_number, 2);
  assert.equal(verdict.command?.branch, "monday-platform-genesis-01");
  assert.equal(verdict.command?.expected_head_sha, head);
  assert.equal(verdict.command?.merge_method, "squash");
  assert.equal(verdict.command?.guard.require_handoff_action, "admit_merge");
  assert.ok(verdict.command?.guard.forbidden_fallbacks.includes("unguarded_merge"));
});

test("blocks merge command through non-GitHub boundaries", () => {
  const verdict = compileMergeCommand(input({ external_boundary: "comment" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_external_boundary");
  assert.deepEqual(verdict.blockers, ["merge command cannot be released through comment"]);
});

test("blocks handoff that has not admitted merge", () => {
  const verdict = compileMergeCommand(
    input({
      handoff: handoff({
        ok: true,
        action: "admit_review_request",
        blockers: [],
        next_route: "request final review on the live PR head",
      }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_unadmitted_handoff");
  assert.ok(verdict.blockers.some((blocker) => blocker.includes("not admit_merge")));
});

test("blocks stale handoff head", () => {
  const verdict = compileMergeCommand(input({ handoff: handoff({ head_sha: staleHead }) }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_handoff_head");
  assert.deepEqual(verdict.blockers, [`terminal handoff head ${staleHead} is not live head ${head}`]);
});

test("blocks missing and repeated command ids", () => {
  const missing = compileMergeCommand(input({ command_id: " " }));
  assert.equal(missing.ok, false);
  assert.equal(missing.action, "block_missing_command_id");

  const repeated = compileMergeCommand(input({ spent_command_ids: [`merge-pr-2:${head}`] }));
  assert.equal(repeated.ok, false);
  assert.equal(repeated.action, "block_repeated_command");
});
