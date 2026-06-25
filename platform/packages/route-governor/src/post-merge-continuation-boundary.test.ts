import assert from "node:assert/strict";
import test from "node:test";

import {
  routePostMergeContinuationBoundary,
  type PostMergeContinuationBoundaryInput,
} from "./post-merge-continuation-boundary.js";

const LIVE_HEAD = "4fbd48ca4539986c874f85394188c405b8d25600";
const MERGE_SHA = "744387e081b4126ddba74d03ee11588e76ed3789";

function input(overrides: Partial<PostMergeContinuationBoundaryInput> = {}): PostMergeContinuationBoundaryInput {
  return {
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    active_branch: "monday-platform-genesis-01",
    live_head_sha: LIVE_HEAD,
    pr_head_sha: LIVE_HEAD,
    pr_state: "closed",
    merged: true,
    merge_commit_sha: MERGE_SHA,
    boundary_id: "post-merge-continuation-pr2-001",
    spent_boundary_ids: [],
    requested_progress_class: "external_platform_embodiment",
    branch_followup_allowed: true,
    ...overrides,
  };
}

test("routes a merged PR away from open-PR continuation and onto branch follow-up", () => {
  const verdict = routePostMergeContinuationBoundary(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "route_to_branch_followup_surface");
  assert.equal(verdict.admitted_progress_class, "external_platform_embodiment");
  assert.ok(verdict.decisive_evidence.includes(`merge commit ${MERGE_SHA}`));
  assert.match(verdict.next_route, /PR continuation as terminal/);
});

test("requires a new external surface when a merged PR cannot accept branch follow-up", () => {
  const verdict = routePostMergeContinuationBoundary(input({ branch_followup_allowed: false }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "require_new_external_surface");
  assert.deepEqual(verdict.blockers, ["PR #2 is merged and cannot remain the active open PR manifestation sink"]);
});

test("allows normal continuation while the PR is still open and unmerged", () => {
  const verdict = routePostMergeContinuationBoundary(
    input({
      pr_state: "open",
      merged: false,
      merge_commit_sha: undefined,
      boundary_id: "open-pr-continuation-001",
      requested_progress_class: "fresh_status_readback",
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "continue_on_open_pull_request");
  assert.equal(verdict.admitted_progress_class, "fresh_status_readback");
});

test("blocks stale PR metadata when the PR head is not the live branch head", () => {
  const verdict = routePostMergeContinuationBoundary(input({ pr_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_head_mismatch");
});

test("blocks merged PR terminal routing without a merge commit receipt", () => {
  const verdict = routePostMergeContinuationBoundary(input({ merge_commit_sha: undefined }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_merge_receipt");
});

test("admits an exact post-merge external blocker only when it is named", () => {
  const verdict = routePostMergeContinuationBoundary(
    input({
      requested_progress_class: "exact_external_blocker",
      blocker: "new external continuation surface has not been opened after PR #2 merge",
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "emit_exact_external_blocker");
  assert.deepEqual(verdict.blockers, ["new external continuation surface has not been opened after PR #2 merge"]);
});
