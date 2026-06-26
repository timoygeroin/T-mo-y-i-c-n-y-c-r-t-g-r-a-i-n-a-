import test from "node:test";
import assert from "node:assert/strict";

import { compileClosedPrSinkBoundary } from "./closed-pr-sink-boundary.js";

const base = {
  pr_number: 2,
  branch: "monday-platform-genesis-01",
  head_sha: "4fbd48ca4539986c874f85394188c405b8d25600",
  branch_writable: true,
  current_instruction_allows_branch_only: true,
} as const;

test("continues on an open PR sink", () => {
  const verdict = compileClosedPrSinkBoundary({
    ...base,
    pr_state: "open",
    requested_surface: "pull_request",
  });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.release_class, "continue_on_open_pr");
  assert.equal(verdict.continuation_surface, "pull_request");
  assert.deepEqual(verdict.blockers, []);
});

test("blocks PR-surface progress after the PR is merged and closed", () => {
  const verdict = compileClosedPrSinkBoundary({
    ...base,
    pr_state: "merged",
    merged_at: "2026-06-24T22:03:25Z",
    requested_surface: "pull_request",
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.release_class, "exact_external_blocker");
  assert.deepEqual(verdict.blockers, [
    "PR #2 / monday-platform-genesis-01 @ 4fbd48ca4539986c874f85394188c405b8d25600 is merged/closed and can no longer serve as an open PR review surface",
  ]);
});

test("admits branch-only continuation when the instruction permits the branch as the surface", () => {
  const verdict = compileClosedPrSinkBoundary({
    ...base,
    pr_state: "merged",
    merged_at: "2026-06-24T22:03:25Z",
    requested_surface: "head_branch",
  });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.release_class, "continue_on_branch_only");
  assert.equal(verdict.continuation_surface, "head_branch");
  assert.match(verdict.next_route, /without claiming PR #2 remains an open review surface/);
});

test("blocks branch-only continuation when it was not explicitly admitted", () => {
  const verdict = compileClosedPrSinkBoundary({
    ...base,
    pr_state: "merged",
    merged_at: "2026-06-24T22:03:25Z",
    current_instruction_allows_branch_only: false,
    requested_surface: "head_branch",
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.release_class, "exact_external_blocker");
  assert.deepEqual(verdict.blockers, [
    "PR #2 / monday-platform-genesis-01 @ 4fbd48ca4539986c874f85394188c405b8d25600 is merged/closed",
    "branch-only continuation was not explicitly admitted",
  ]);
});

test("blocks unmerged closed PR sinks until they are reopened or replaced", () => {
  const verdict = compileClosedPrSinkBoundary({
    ...base,
    pr_state: "closed_unmerged",
    requested_surface: "pull_request",
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.release_class, "exact_external_blocker");
  assert.match(verdict.next_route, /reopen the PR or create a replacement PR/);
});
