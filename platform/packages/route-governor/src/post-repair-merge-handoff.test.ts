import test from "node:test";
import assert from "node:assert/strict";

import {
  compilePostRepairMergeHandoff,
  type PostRepairMergeHandoffInput,
} from "./post-repair-merge-handoff.js";

const branch = "monday-platform-genesis-01";
const liveHead = "f158385f1ce6c81ef7d38a6c6f69161423287291";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function input(overrides: Partial<PostRepairMergeHandoffInput> = {}): PostRepairMergeHandoffInput {
  return {
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    active_branch: branch,
    candidate_branch: branch,
    live_head_sha: liveHead,
    repaired_head_sha: repairedHead,
    last_status_readback_head_sha: repairedHead,
    resolved_blocker_ids: ["issue-1-ci-status-readback"],
    draft: false,
    mergeable: true,
    requested_intent: "request_review",
    status_surface: {
      surface_id: "checks:f158385f",
      head_sha: liveHead,
      verdict: "passing_with_warnings",
      decisive_successes: ["Monday Platform CI succeeded", "Route Governor Proof succeeded"],
      blockers: [],
      warnings: ["Node.js 20 Actions deprecation notice"],
    },
    required_approval_count: 1,
    approval_count: 0,
    ...overrides,
  };
}

test("admits review handoff after repaired-head blocker is retired and live status passes with warnings", () => {
  const verdict = compilePostRepairMergeHandoff(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_review_handoff");
  assert.equal(verdict.branch, branch);
  assert.equal(verdict.head_sha, liveHead);
  assert.deepEqual(verdict.blockers, []);
  assert.deepEqual(verdict.retired_heads, [repairedHead]);
  assert.ok(verdict.decisive_evidence.includes("resolved blocker issue-1-ci-status-readback"));
  assert.ok(verdict.warnings.includes("Node.js 20 Actions deprecation notice"));
});

test("blocks replay when the live head is still the repaired historical head", () => {
  const verdict = compilePostRepairMergeHandoff(
    input({
      live_head_sha: repairedHead,
      last_status_readback_head_sha: repairedHead,
      status_surface: {
        surface_id: "checks:repaired-head",
        head_sha: repairedHead,
        verdict: "passing",
        decisive_successes: ["old repaired-head checks succeeded"],
        blockers: [],
        warnings: [],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_repaired_head_replay");
});

test("blocks warning-only maintenance as a substitute for handoff", () => {
  const verdict = compilePostRepairMergeHandoff(input({ requested_intent: "warning_maintenance" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_warning_maintenance");
  assert.deepEqual(verdict.blockers, ["warning-only maintenance cannot replace post-repair review or merge handoff"]);
});

test("rejects stale status surfaces from an older head", () => {
  const verdict = compilePostRepairMergeHandoff(
    input({
      status_surface: {
        surface_id: "checks:older-head",
        head_sha: "older-head",
        verdict: "passing",
        decisive_successes: ["old checks succeeded"],
        blockers: [],
        warnings: [],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_status_surface");
  assert.deepEqual(verdict.blockers, [`status surface checks:older-head belongs to older-head, not ${liveHead}`]);
});

test("holds merge handoff until live-head approval exists", () => {
  const verdict = compilePostRepairMergeHandoff(input({ requested_intent: "merge" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_unready_pr");
  assert.deepEqual(verdict.blockers, ["merge handoff requires 1 approval(s); got 0"]);
});

test("admits merge handoff after approval count satisfies the live-head requirement", () => {
  const verdict = compilePostRepairMergeHandoff(input({ requested_intent: "merge", approval_count: 1 }));

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_merge_handoff");
  assert.deepEqual(verdict.blockers, []);
  assert.ok(verdict.decisive_evidence.includes("approvals 1"));
});

test("routes to live status readback when no current status surface is attached", () => {
  const verdict = compilePostRepairMergeHandoff(input({ status_surface: undefined }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "route_to_live_status_readback");
  assert.deepEqual(verdict.blockers, [`no live-head status surface is attached for ${liveHead}`]);
});
