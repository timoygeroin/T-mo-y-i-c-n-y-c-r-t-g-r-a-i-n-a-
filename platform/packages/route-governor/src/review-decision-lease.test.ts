import test from "node:test";
import assert from "node:assert/strict";

import { leaseReviewDecision, type ReviewDecisionLeaseInput } from "./review-decision-lease.js";
import type { ReviewResponseIntakeVerdict } from "./review-response-intake.js";

const branch = "monday-platform-genesis-01";
const head = "2d71c2fd9a16d46ed5692ed7c53cb36cdb22d359";
const olderHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function intake(overrides: Partial<ReviewResponseIntakeVerdict> = {}): ReviewResponseIntakeVerdict {
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
    decisive_evidence: [`live head ${head}`, "approved by external-reviewer"],
    blockers: [],
    next_route: "enter merge gate only after live-head status and mergeability are still current",
    ...overrides,
  };
}

function input(overrides: Partial<ReviewDecisionLeaseInput> = {}): ReviewDecisionLeaseInput {
  return {
    active_branch: branch,
    live_head_sha: head,
    lease_id: `review-decision:${head}:001`,
    spent_lease_ids: [],
    intake: intake(),
    requested_next_action: "merge_gate",
    ...overrides,
  };
}

test("leases approved live-head review intake into the merge gate", () => {
  const verdict = leaseReviewDecision(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_merge_gate_decision");
  assert.deepEqual(verdict.blockers, []);
  assert.ok(verdict.decisive_evidence.includes("approved by external-reviewer"));
  assert.match(verdict.next_route, /refresh live-head status and mergeability/);
});

test("blocks review intake from an older repaired head", () => {
  const verdict = leaseReviewDecision(
    input({
      intake: intake({ head_sha: olderHead }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_intake_head");
  assert.deepEqual(verdict.blockers, [`review intake head ${olderHead} is not live head ${head}`]);
});

test("blocks reusing the same review decision lease", () => {
  const verdict = leaseReviewDecision(input({ spent_lease_ids: [`review-decision:${head}:001`] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_repeated_decision_lease");
  assert.deepEqual(verdict.blockers, [`review decision lease already spent: review-decision:${head}:001`]);
});

test("blocks metadata rereads from consuming review decisions as progress", () => {
  const verdict = leaseReviewDecision(input({ requested_next_action: "metadata_reread" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_progress_action");
  assert.deepEqual(verdict.blockers, ["metadata_reread cannot consume a review decision lease as progress"]);
});

test("requires change-request review intake to become bounded repair", () => {
  const verdict = leaseReviewDecision(
    input({
      intake: intake({
        ok: false,
        action: "route_to_review_repair",
        approvals: [],
        change_requests: ["external-reviewer"],
        blockers: ["review changes requested by external-reviewer"],
        next_route: "repair the live-head review changes before requesting merge readiness",
      }),
      requested_next_action: "review_repair",
      repair_boundaries: [
        {
          reviewer: "external-reviewer",
          file_paths: ["platform/packages/route-governor/src/review-decision-lease.ts"],
          summary: "Bind the review decision lease before repair routing.",
        },
      ],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_review_repair_decision");
  assert.ok(verdict.decisive_evidence.includes("repair path platform/packages/route-governor/src/review-decision-lease.ts"));
});

test("blocks vague change-request repair without file boundaries", () => {
  const verdict = leaseReviewDecision(
    input({
      intake: intake({
        ok: false,
        action: "route_to_review_repair",
        approvals: [],
        change_requests: ["external-reviewer"],
        blockers: ["review changes requested by external-reviewer"],
      }),
      requested_next_action: "review_repair",
      repair_boundaries: [{ reviewer: "external-reviewer", file_paths: [], summary: "" }],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_repair_boundaries");
  assert.deepEqual(verdict.blockers, [
    "review repair for external-reviewer has no file-bound repair path",
    "review repair for external-reviewer has no repair summary",
  ]);
});

test("preserves waiting as a leased decision instead of a duplicate comment", () => {
  const verdict = leaseReviewDecision(
    input({
      intake: intake({
        ok: false,
        action: "wait_for_review_response",
        approvals: [],
        pending_reviewers: ["external-reviewer"],
        blockers: ["required review approval has not surfaced on the live head"],
      }),
      requested_next_action: "wait_for_review",
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "wait_for_review_decision");
  assert.deepEqual(verdict.blockers, ["required review approval has not surfaced on the live head"]);
});
