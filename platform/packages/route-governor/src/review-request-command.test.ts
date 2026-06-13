import assert from "node:assert/strict";
import { test } from "node:test";

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
    decisive_evidence: [`live head ${head}`, "status surface repaired-head-readback-b38"],
    blockers: [],
    quarantined_heads: [],
    warnings: ["Node.js 20 Actions deprecation notice"],
    next_route: "request final review on the live PR head",
    ...overrides,
  };
}

function input(overrides: Partial<ReviewRequestCommandInput> = {}): ReviewRequestCommandInput {
  return {
    handoff: handoff(),
    requested_reviewers: ["z-reviewer", "a-reviewer", "a-reviewer"],
    requested_team_reviewers: ["platform-team"],
    command_id: `review-request:${head}`,
    spent_command_ids: [],
    external_boundary: "github_pull_request_review_request",
    ...overrides,
  };
}

test("compiles admitted terminal handoff into a guarded GitHub reviewer request command", () => {
  const verdict = compileReviewRequestCommand(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "compile_review_request_command");
  assert.equal(verdict.command?.repository_full_name, "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-");
  assert.equal(verdict.command?.pr_number, 2);
  assert.equal(verdict.command?.head_sha, head);
  assert.deepEqual(verdict.command?.reviewers, ["a-reviewer", "z-reviewer"]);
  assert.deepEqual(verdict.command?.team_reviewers, ["platform-team"]);
  assert(verdict.decisive_evidence.includes(`review-request:${head}`));
});

test("blocks a review command when the terminal handoff is not admitted", () => {
  const verdict = compileReviewRequestCommand(
    input({
      handoff: handoff({
        ok: false,
        action: "route_to_external_embodiment",
        blockers: ["live head is not the last admitted embodiment head"],
      }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_unadmitted_handoff");
  assert(verdict.blockers.includes("terminal handoff action is route_to_external_embodiment, not admit_review_request"));
});

test("blocks missing reviewer targets", () => {
  const verdict = compileReviewRequestCommand(input({ requested_reviewers: [], requested_team_reviewers: [] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_review_target");
});

test("blocks repeated command ids", () => {
  const verdict = compileReviewRequestCommand(input({ spent_command_ids: [`review-request:${head}`] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_repeated_command");
});

test("blocks non-review external boundaries", () => {
  const verdict = compileReviewRequestCommand(input({ external_boundary: "status_readback" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_external_boundary");
});
