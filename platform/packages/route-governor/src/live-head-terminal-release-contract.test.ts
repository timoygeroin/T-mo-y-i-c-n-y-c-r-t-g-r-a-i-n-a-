import assert from "node:assert/strict";
import { test } from "node:test";

import {
  compileLiveHeadTerminalRelease,
  type LiveHeadTerminalReleaseInput,
} from "./live-head-terminal-release-contract.js";

const repo = "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-";
const branch = "monday-platform-genesis-01";
const liveHead = "6e00324944b3ce63540367587419f5a7918e921a";
const priorHead = "b50b5f8019aa9b3ecaa141771d9e156388904f26";

function input(overrides: Partial<LiveHeadTerminalReleaseInput> = {}): LiveHeadTerminalReleaseInput {
  return {
    repository_full_name: repo,
    pr_number: 2,
    active_branch: branch,
    command_branch: branch,
    live_head_sha: liveHead,
    command_head_sha: liveHead,
    previous_status_head_sha: priorHead,
    status_surface: {
      surface_id: "current-head-checks-6e003249",
      head_sha: liveHead,
      verdict: "passing_with_warnings",
      decisive_successes: ["Route Governor Proof succeeded", "Monday Platform CI succeeded"],
      blockers: [],
      warnings: ["Node.js 20 Actions deprecation notice is warning-only"],
    },
    draft: false,
    mergeable: true,
    requested_intent: "request_review",
    requested_reviewers: ["external-reviewer"],
    requested_team_reviewers: [],
    spent_review_target_sets: [],
    required_approval_count: 1,
    approval_count: 0,
    ...overrides,
  };
}

test("issues a live-head review request only with passing status and fresh targets", () => {
  const verdict = compileLiveHeadTerminalRelease(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "issue_review_request");
  assert.equal(verdict.head_sha, liveHead);
  assert.equal(verdict.review_target_set_id, `${branch}@${liveHead}|user:external-reviewer|`);
  assert.match(verdict.next_route, /wait for live-head review response/);
});

test("blocks a stale terminal command head", () => {
  const verdict = compileLiveHeadTerminalRelease(input({ command_head_sha: priorHead }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_command_head");
  assert.ok(verdict.blockers.some((blocker) => blocker.includes(`not live head ${liveHead}`)));
});

test("blocks repeated status readback on an already read live head", () => {
  const verdict = compileLiveHeadTerminalRelease(
    input({
      requested_intent: "fresh_status_readback",
      previous_status_head_sha: liveHead,
      requested_reviewers: [],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_status_readback");
  assert.match(verdict.next_route, /move the PR head/);
});

test("routes moved heads to a single status readback before release", () => {
  const verdict = compileLiveHeadTerminalRelease(
    input({
      requested_intent: "fresh_status_readback",
      previous_status_head_sha: priorHead,
      requested_reviewers: [],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "read_moved_head_status");
  assert.ok(verdict.decisive_evidence.some((evidence) => evidence.includes(priorHead)));
});

test("blocks terminal review release without external targets", () => {
  const verdict = compileLiveHeadTerminalRelease(input({ requested_reviewers: [], requested_team_reviewers: [] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_review_targets");
  assert.match(verdict.next_route, /reviewer-target blocker/);
});

test("blocks merge until live-head approval is present", () => {
  const verdict = compileLiveHeadTerminalRelease(
    input({
      requested_intent: "merge",
      requested_reviewers: [],
      required_approval_count: 1,
      approval_count: 0,
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_approval");
  assert.ok(verdict.blockers.includes("merge requires 1 live-head approval(s); got 0"));
});

test("compiles merge only after live-head approval", () => {
  const verdict = compileLiveHeadTerminalRelease(
    input({
      requested_intent: "merge",
      requested_reviewers: [],
      required_approval_count: 1,
      approval_count: 1,
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "compile_merge_command");
  assert.match(verdict.next_route, /guarded GitHub merge command/);
});

test("emits one exact blocker without requiring status readiness", () => {
  const verdict = compileLiveHeadTerminalRelease(
    input({
      requested_intent: "exact_external_blocker",
      status_surface: undefined,
      requested_reviewers: [],
      exact_blocker: "no real external reviewer target is available for PR #2",
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "emit_exact_external_blocker");
  assert.deepEqual(verdict.blockers, ["no real external reviewer target is available for PR #2"]);
});
