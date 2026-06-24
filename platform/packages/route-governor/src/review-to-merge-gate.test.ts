import assert from "node:assert/strict";
import { test } from "node:test";

import { compileReviewToMergeGate, type ReviewToMergeGateInput } from "./review-to-merge-gate.js";

const head = "84ee38a1711e9bda79e36e8d82dcc36c35b111de";

function baseInput(overrides: Partial<ReviewToMergeGateInput> = {}): ReviewToMergeGateInput {
  return {
    gate_id: "review-to-merge-gate-001",
    spent_gate_ids: [],
    active_branch: "monday-platform-genesis-01",
    live_head_sha: head,
    draft: false,
    mergeable: true,
    required_approval_count: 1,
    review_intake: {
      ok: true,
      action: "route_to_merge_gate",
      repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
      pr_number: 2,
      branch: "monday-platform-genesis-01",
      head_sha: head,
      approvals: ["external-reviewer"],
      change_requests: [],
      pending_reviewers: [],
      decisive_evidence: [`live head ${head}`, "approved by external-reviewer"],
      blockers: [],
      next_route: "enter merge gate only after live-head status and mergeability are still current",
    },
    mergeability_lease: {
      ok: true,
      action: "admit_mergeability_lease",
      branch: "monday-platform-genesis-01",
      head_sha: head,
      lease_id: "mergeability-live-head-001",
      target: "merge_command",
      decisive_evidence: [`live head ${head}`, "mergeable true"],
      blockers: [],
      next_route: "use this lease only for the named target on the live head; refresh mergeability after any branch movement",
    },
    status_surface: {
      surface_id: "checks-live-head-001",
      head_sha: head,
      verdict: "passing_with_warnings",
      decisive_successes: ["Route governor proof examples succeeded"],
      blocking_failures: [],
      pending_surfaces: [],
      non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
    },
    ...overrides,
  };
}

test("admits merge finalization only when review, mergeability, and status converge on the live head", () => {
  const verdict = compileReviewToMergeGate(baseInput());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_merge_finalization_gate");
  assert.equal(verdict.head_sha, head);
  assert.deepEqual(verdict.approvals, ["external-reviewer"]);
  assert.deepEqual(verdict.blockers, []);
  assert.ok(verdict.decisive_evidence.includes("status surface checks-live-head-001"));
});

test("routes requested review changes to review repair instead of merge finalization", () => {
  const verdict = compileReviewToMergeGate(
    baseInput({
      review_intake: {
        ...baseInput().review_intake,
        ok: false,
        action: "route_to_review_repair",
        approvals: [],
        change_requests: ["external-reviewer"],
        blockers: ["review changes requested by external-reviewer"],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "route_to_review_repair");
  assert.deepEqual(verdict.blockers, ["review changes requested by external-reviewer"]);
});

test("blocks stale review intake bound to an older head", () => {
  const verdict = compileReviewToMergeGate(
    baseInput({
      review_intake: {
        ...baseInput().review_intake,
        head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_review_intake");
  assert.match(verdict.blockers.join("\n"), /not live head/);
});

test("blocks mergeability leases not targeted to merge commands", () => {
  const verdict = compileReviewToMergeGate(
    baseInput({
      mergeability_lease: {
        ...baseInput().mergeability_lease!,
        target: "review_request",
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_mergeability_lease");
  assert.match(verdict.blockers.join("\n"), /review_request/);
});

test("blocks pending or failing live-head status", () => {
  const verdict = compileReviewToMergeGate(
    baseInput({
      status_surface: {
        ...baseInput().status_surface!,
        verdict: "pending",
        decisive_successes: [],
        pending_surfaces: ["Monday Platform CI pending"],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_status_not_passing");
  assert.match(verdict.blockers.join("\n"), /pending/);
});

test("blocks repeated gate ids", () => {
  const verdict = compileReviewToMergeGate(
    baseInput({
      spent_gate_ids: ["review-to-merge-gate-001"],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_repeated_gate");
});
