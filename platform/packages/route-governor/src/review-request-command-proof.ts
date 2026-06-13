import assert from "node:assert/strict";

import { compileReviewRequestCommand, type ReviewRequestCommandInput } from "./review-request-command.js";
import type { TerminalReviewHandoffVerdict } from "./terminal-review-handoff.js";

const head = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function handoff(overrides: Partial<TerminalReviewHandoffVerdict> = {}): TerminalReviewHandoffVerdict {
  return {
    ok: true,
    action: "admit_review_request",
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch: "monday-platform-genesis-01",
    head_sha: head,
    decisive_evidence: [
      `live head ${head}`,
      "status surface repaired-head-readback-b38",
      "seven repaired-head checks succeeded",
    ],
    blockers: [],
    quarantined_heads: [],
    warnings: ["Node.js 20 Actions deprecation notice"],
    next_route: "request final review on the live PR head; do not recycle repaired-head status or add another readiness guard",
    ...overrides,
  };
}

function input(overrides: Partial<ReviewRequestCommandInput> = {}): ReviewRequestCommandInput {
  return {
    handoff: handoff(),
    requested_reviewers: ["platform-reviewer"],
    requested_team_reviewers: [],
    command_id: `review-request:${head}`,
    spent_command_ids: [],
    external_boundary: "github_pull_request_review_request",
    ...overrides,
  };
}

const compiled = compileReviewRequestCommand(input());
assert.equal(compiled.ok, true);
assert.equal(compiled.action, "compile_review_request_command");
assert.equal(compiled.command?.operation, "request_pull_request_reviewers");
assert.equal(compiled.command?.guard.require_live_head_sha, head);
assert.deepEqual(compiled.command?.guard.forbidden_fallbacks, [
  "duplicate_comment",
  "metadata_reread",
  "stale_repaired_head_status",
  "local_memory_guard",
]);

const noTarget = compileReviewRequestCommand(input({ requested_reviewers: [], requested_team_reviewers: [] }));
assert.equal(noTarget.ok, false);
assert.equal(noTarget.action, "block_missing_review_target");
assert.deepEqual(noTarget.blockers, ["review request command has no reviewer or team reviewer target"]);

const staleHandoff = compileReviewRequestCommand(
  input({
    handoff: handoff({
      ok: false,
      action: "route_to_status_readback",
      blockers: ["no status surface is attached for live head next-head"],
    }),
  }),
);
assert.equal(staleHandoff.ok, false);
assert.equal(staleHandoff.action, "block_unadmitted_handoff");
assert(staleHandoff.blockers.some((blocker) => blocker.includes("not admit_review_request")));

const repeated = compileReviewRequestCommand(input({ spent_command_ids: [`review-request:${head}`] }));
assert.equal(repeated.ok, false);
assert.equal(repeated.action, "block_repeated_command");

const wrongBoundary = compileReviewRequestCommand(input({ external_boundary: "comment" }));
assert.equal(wrongBoundary.ok, false);
assert.equal(wrongBoundary.action, "block_external_boundary");

console.log("review request command proof passed");
