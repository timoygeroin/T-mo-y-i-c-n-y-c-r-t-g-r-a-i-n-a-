import test from "node:test";
import assert from "node:assert/strict";

import { compileTerminalReleaseInstruction, type TerminalReleaseInstructionInput } from "./terminal-release-instruction.js";

const passingStatus = {
  surface_id: "checks-427b34d",
  head_sha: "427b34da1a3d32a6f499e321d4bf8dbf1a60556f",
  verdict: "passing_with_warnings" as const,
  decisive_successes: ["Route governor proof examples succeeded", "Monday Platform CI succeeded"],
  blockers: [],
  warnings: ["Node.js 20 Actions deprecation notice"],
};

function input(overrides: Partial<TerminalReleaseInstructionInput> = {}): TerminalReleaseInstructionInput {
  return {
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch: "monday-platform-genesis-01",
    live_head_sha: "427b34da1a3d32a6f499e321d4bf8dbf1a60556f",
    last_executable_head_sha: "427b34da1a3d32a6f499e321d4bf8dbf1a60556f",
    historical_repaired_heads: ["b38ea247602ae8ebba80c4120ad03b41b26bd841"],
    draft: false,
    mergeable: true,
    review_requested: false,
    requested_target: "merge",
    status_surface: passingStatus,
    ...overrides,
  };
}

test("releases a guarded merge instruction for the admitted live head", () => {
  const verdict = compileTerminalReleaseInstruction(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "release_merge_instruction");
  assert.equal(verdict.target, "merge");
  assert.deepEqual(verdict.blockers, []);
  assert.match(verdict.next_route, /guarded GitHub merge command/);
  assert.deepEqual(verdict.warnings, ["Node.js 20 Actions deprecation notice"]);
});

test("routes a moved live head to executable embodiment before terminal release", () => {
  const verdict = compileTerminalReleaseInstruction(
    input({
      live_head_sha: "5000000000000000000000000000000000000000",
      last_executable_head_sha: "427b34da1a3d32a6f499e321d4bf8dbf1a60556f",
      status_surface: undefined,
      requested_target: "continue_embodiment",
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "release_embodiment_instruction");
  assert.equal(verdict.target, "continue_embodiment");
  assert.match(verdict.next_route, /executable embodiment receipt/);
});

test("blocks stale status surfaces before review or merge", () => {
  const verdict = compileTerminalReleaseInstruction(
    input({
      status_surface: {
        ...passingStatus,
        surface_id: "checks-old",
        head_sha: "3000000000000000000000000000000000000000",
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_surface");
  assert.deepEqual(verdict.blockers, ["status surface checks-old belongs to 3000000000000000000000000000000000000000"]);
});

test("blocks historical repaired heads as terminal authority", () => {
  const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
  const verdict = compileTerminalReleaseInstruction(
    input({
      live_head_sha: repairedHead,
      last_executable_head_sha: repairedHead,
      historical_repaired_heads: [repairedHead],
      status_surface: {
        ...passingStatus,
        head_sha: repairedHead,
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_historical_head");
  assert.match(verdict.blockers[0], /resolved historical repaired head/);
});

test("requires exact blocker text for blocker releases", () => {
  const verdict = compileTerminalReleaseInstruction(
    input({
      requested_target: "block",
      exact_blocker: "",
      status_surface: undefined,
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_ambiguous_terminal_instruction");
  assert.deepEqual(verdict.blockers, ["block target has no exact blocker text"]);
});

test("releases review instruction without duplicating status or labels", () => {
  const verdict = compileTerminalReleaseInstruction(input({ requested_target: "request_review" }));

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "release_review_instruction");
  assert.equal(verdict.target, "request_review");
  assert.match(verdict.next_route, /avoid duplicate comments or labels/);
});
