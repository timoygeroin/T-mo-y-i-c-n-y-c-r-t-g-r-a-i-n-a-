import test from "node:test";
import assert from "node:assert/strict";

import { compileMergeReadiness, type MergeReadinessInput } from "./merge-readiness.js";

const branch = "monday-platform-genesis-01";
const head = "d4e377a9ff8f5e43df1f5aeba20a32fff90efbdb";

function input(overrides: Partial<MergeReadinessInput> = {}): MergeReadinessInput {
  return {
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch,
    active_branch: branch,
    head_sha: head,
    draft: false,
    mergeable: true,
    status_surface: {
      verdict: "passing_with_warnings",
      ok: true,
      decisive_successes: ["Route Governor Proof / proof examples: success"],
      blocking_failures: [],
      pending_surfaces: [],
      non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
    },
    evidence: {
      executable_artifacts: ["compileMergeReadiness"],
      routing_artifacts: ["merge readiness compiler"],
      status_surface_ids: ["27049651467"],
    },
    ...overrides,
  };
}

test("accepts merge readiness only after status, mergeability, and embodiment evidence survive", () => {
  const verdict = compileMergeReadiness(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "merge_ready");
  assert.deepEqual(verdict.blockers, []);
  assert.deepEqual(verdict.warnings, ["Node.js 20 Actions deprecation notice"]);
  assert.ok(verdict.decisive_evidence.includes("compileMergeReadiness"));
  assert.equal(
    verdict.next_route,
    "request final review or merge through the authorized GitHub boundary; do not add another embodiment guard unless a new blocker appears",
  );
});

test("routes a missing status surface to current-head readback instead of guessing", () => {
  const verdict = compileMergeReadiness(input({ status_surface: undefined }));

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "read_current_head_status");
  assert.deepEqual(verdict.blockers, []);
  assert.equal(verdict.next_route, "read the current-head status surface before making any merge-readiness claim");
});

test("waits when the current-head status surface is pending", () => {
  const verdict = compileMergeReadiness(
    input({
      status_surface: {
        verdict: "pending",
        ok: false,
        decisive_successes: [],
        blocking_failures: [],
        pending_surfaces: ["Monday Platform CI / Route governor proof surface"],
        non_blocking_warnings: [],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "wait_for_checks");
  assert.deepEqual(verdict.blockers, ["Monday Platform CI / Route governor proof surface"]);
});

test("repairs when the current-head status surface is failing", () => {
  const verdict = compileMergeReadiness(
    input({
      status_surface: {
        verdict: "failing",
        ok: false,
        decisive_successes: [],
        blocking_failures: ["Route Governor Proof / Typecheck route governor: failure"],
        pending_surfaces: [],
        non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "repair_status_failure");
  assert.deepEqual(verdict.blockers, ["Route Governor Proof / Typecheck route governor: failure"]);
  assert.deepEqual(verdict.warnings, ["Node.js 20 Actions deprecation notice"]);
});

test("continues embodiment when executable or routing evidence is missing", () => {
  const verdict = compileMergeReadiness(
    input({
      evidence: {
        executable_artifacts: [],
        routing_artifacts: [],
        status_surface_ids: ["27049651467"],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "continue_external_embodiment");
  assert.ok(verdict.blockers.some((blocker) => blocker.includes("executable platform artifact")));
  assert.ok(verdict.blockers.some((blocker) => blocker.includes("future-routing artifact")));
});

test("blocks merge readiness when GitHub mergeability is not confirmed", () => {
  const verdict = compileMergeReadiness(input({ mergeable: "unknown" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_release");
  assert.deepEqual(verdict.blockers, [`GitHub mergeability is not confirmed for head ${head}`]);
});

test("blocks merge readiness for the wrong branch or draft PR", () => {
  const wrongBranch = compileMergeReadiness(input({ branch: "main" }));
  assert.equal(wrongBranch.ok, false);
  assert.equal(wrongBranch.action, "block_release");
  assert.ok(wrongBranch.blockers[0].includes("does not match active branch"));

  const draft = compileMergeReadiness(input({ draft: true }));
  assert.equal(draft.ok, false);
  assert.equal(draft.action, "block_release");
  assert.deepEqual(draft.blockers, ["PR is still draft and cannot be treated as merge-ready"]);
});
