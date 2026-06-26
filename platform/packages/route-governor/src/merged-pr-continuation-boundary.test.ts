import assert from "node:assert/strict";
import test from "node:test";

import {
  routeMergedPrContinuationBoundary,
  type MergedPrContinuationBoundaryInput,
} from "./merged-pr-continuation-boundary.js";

function base(overrides: Partial<MergedPrContinuationBoundaryInput> = {}): MergedPrContinuationBoundaryInput {
  return {
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch: "monday-platform-genesis-01",
    prompt_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
    live_head_sha: "4fbd48ca4539986c874f85394188c405b8d25600",
    pr_state: "closed",
    merged: true,
    branch_readable: true,
    branch_continuation_admitted: true,
    requested_surface: "pr_or_branch",
    merge_commit_sha: "744387e081b4126ddba74d03ee11588e76ed3789",
    branch_executable_delta_files: [],
    evidence: ["connector PR readback reports closed/merged"],
    ...overrides,
  };
}

test("merged PR branch-only continuation requires executable platform delta evidence", () => {
  const verdict = routeMergedPrContinuationBoundary(base());

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_branch_executable_delta");
  assert.deepEqual(verdict.blockers, ["branch-only continuation after a merged PR requires executable platform delta evidence"]);
});

test("merged PR branch-only continuation admits executable platform delta evidence", () => {
  const verdict = routeMergedPrContinuationBoundary(
    base({
      branch_executable_delta_files: [
        "platform/packages/route-governor/src/merged-pr-continuation-boundary.ts",
        "docs/not-executable.md",
      ],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "route_branch_only_continuation");
  assert.ok(
    verdict.decisive_evidence.includes(
      "branch executable delta platform/packages/route-governor/src/merged-pr-continuation-boundary.ts",
    ),
  );
  assert.equal(
    verdict.decisive_evidence.includes("branch executable delta docs/not-executable.md"),
    false,
  );
});

test("merged PR review and merge commands are retired to the consumed PR surface", () => {
  const verdict = routeMergedPrContinuationBoundary(
    base({
      requested_surface: "pr_only",
      branch_continuation_admitted: false,
      branch_executable_delta_files: ["platform/packages/route-governor/src/merged-pr-continuation-boundary.ts"],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "seal_merged_pr_surface");
  assert.equal(
    verdict.next_route,
    "stop adding PR-branch embodiment increments; choose a new external sink or explicitly admit branch-only continuation with executable delta evidence",
  );
});
