import assert from "node:assert/strict";
import { test } from "node:test";

import {
  compileReviewResponseMergeHandoff,
  type ReviewResponseMergeHandoffInput,
} from "./review-response-merge-handoff.js";
import type { ReviewResponseIntakeVerdict } from "./review-response-intake.js";

const head = "a214343108e577a7ad8e5e9063b689a1e7f5a63a";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const branch = "monday-platform-genesis-01";

function response(overrides: Partial<ReviewResponseIntakeVerdict> = {}): ReviewResponseIntakeVerdict {
  return {
    ok: true,
    action: "route_to_merge_gate",
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch,
    head_sha: head,
    approvals: ["external-reviewer"],
    change_requests: [],
    pending_reviewers: [],
    decisive_evidence: [`receipt head ${head}`, `approved by external-reviewer`],
    blockers: [],
    next_route: "enter merge gate only after live-head status and mergeability are still current",
    ...overrides,
  };
}

function input(overrides: Partial<ReviewResponseMergeHandoffInput> = {}): ReviewResponseMergeHandoffInput {
  return {
    response: response(),
    repaired_head_sha: repairedHead,
    last_status_readback_head_sha: head,
    resolved_blocker_ids: ["blocked:ci-status-readback"],
    draft: false,
    mergeable: true,
    required_approval_count: 1,
    status_surface: {
      surface_id: "status-readback-live-head-a2143431",
      head_sha: head,
      verdict: "passing_with_warnings",
      decisive_successes: ["Route Governor Proof succeeded", "Monday Platform CI succeeded"],
      blockers: [],
      warnings: ["Node.js 20 Actions deprecation notice"],
    },
    ...overrides,
  };
}

test("compiles approved live-head response into guarded merge handoff", () => {
  const verdict = compileReviewResponseMergeHandoff(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "compile_merge_handoff");
  assert.equal(verdict.merge_handoff?.action, "admit_merge_handoff");
  assert.deepEqual(verdict.blockers, []);
  assert.ok(verdict.decisive_evidence.includes("approved by external-reviewer"));
});

test("routes requested changes to review repair instead of merge", () => {
  const verdict = compileReviewResponseMergeHandoff(
    input({
      response: response({
        ok: false,
        action: "route_to_review_repair",
        approvals: [],
        change_requests: ["external-reviewer"],
        blockers: ["review changes requested by external-reviewer"],
      }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "route_to_review_repair");
  assert.deepEqual(verdict.blockers, ["review changes requested by external-reviewer"]);
});

test("waits when approval has not surfaced", () => {
  const verdict = compileReviewResponseMergeHandoff(
    input({
      response: response({
        ok: false,
        action: "wait_for_review_response",
        approvals: [],
        pending_reviewers: ["external-reviewer"],
        blockers: ["required review approval has not surfaced on the live head"],
      }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "wait_for_review_response");
  assert.deepEqual(verdict.blockers, ["waiting for review response from external-reviewer"]);
});

test("blocks approval when live-head status is not merge-ready", () => {
  const verdict = compileReviewResponseMergeHandoff(
    input({
      status_surface: {
        surface_id: "status-readback-live-head-a2143431",
        head_sha: head,
        verdict: "pending",
        decisive_successes: [],
        blockers: [],
        warnings: [],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_unready_merge_handoff");
  assert(verdict.blockers.includes("live status surface has no decisive success evidence"));
  assert(verdict.blockers.includes("live status surface is pending"));
});

test("blocks merge handoff when required approvals exceed surfaced approvals", () => {
  const verdict = compileReviewResponseMergeHandoff(input({ required_approval_count: 2 }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_unready_merge_handoff");
  assert.deepEqual(verdict.blockers, ["merge handoff requires 2 approval(s); got 1"]);
});
