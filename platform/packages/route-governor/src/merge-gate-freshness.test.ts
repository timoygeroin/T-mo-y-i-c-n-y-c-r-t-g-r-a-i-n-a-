import assert from "node:assert/strict";
import test from "node:test";

import { compileMergeGateFreshness } from "./merge-gate-freshness.js";
import type { MergeReadinessVerdict } from "./merge-readiness.js";
import type { ReviewResponseIntakeVerdict } from "./review-response-intake.js";

const head = "e20bca61bca91fcf77a7167a0418d1d0592ec471";

function review(overrides: Partial<ReviewResponseIntakeVerdict> = {}): ReviewResponseIntakeVerdict {
  return {
    ok: true,
    action: "route_to_merge_gate",
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch: "monday-platform-genesis-01",
    head_sha: head,
    approvals: ["external-reviewer"],
    change_requests: [],
    pending_reviewers: [],
    decisive_evidence: [`receipt head ${head}`, "approved by external-reviewer"],
    blockers: [],
    next_route: "enter merge gate only after live-head status and mergeability are still current",
    ...overrides,
  };
}

function readiness(overrides: Partial<MergeReadinessVerdict> = {}): MergeReadinessVerdict {
  return {
    ok: true,
    action: "merge_ready",
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch: "monday-platform-genesis-01",
    head_sha: head,
    decisive_evidence: ["current-head checks succeeded", "GitHub mergeability true"],
    blockers: [],
    warnings: ["Node.js 20 Actions deprecation notice"],
    next_route: "request final review or merge through the authorized GitHub boundary",
    ...overrides,
  };
}

test("admits a merge gate only when review and readiness share the live head", () => {
  const verdict = compileMergeGateFreshness({
    review_intake: review(),
    merge_readiness: readiness(),
    live_head_sha: head,
    gate_id: `merge-gate-pr-2:${head}`,
    spent_gate_ids: [],
  });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_fresh_merge_gate");
  assert.equal(verdict.gate_id, `merge-gate-pr-2:${head}`);
  assert.deepEqual(verdict.approvals, ["external-reviewer"]);
  assert.deepEqual(verdict.blockers, []);
  assert.deepEqual(verdict.warnings, ["Node.js 20 Actions deprecation notice"]);
});

test("blocks stale review approval from crossing a live-head move", () => {
  const verdict = compileMergeGateFreshness({
    review_intake: review({ head_sha: "older-review-head" }),
    merge_readiness: readiness(),
    live_head_sha: head,
    gate_id: `merge-gate-pr-2:${head}`,
    spent_gate_ids: [],
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_review_gate");
  assert.match(verdict.blockers.join("\n"), /older-review-head/);
});

test("blocks stale merge readiness from crossing a live-head move", () => {
  const verdict = compileMergeGateFreshness({
    review_intake: review(),
    merge_readiness: readiness({ head_sha: "older-readiness-head" }),
    live_head_sha: head,
    gate_id: `merge-gate-pr-2:${head}`,
    spent_gate_ids: [],
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_readiness_gate");
  assert.match(verdict.blockers.join("\n"), /older-readiness-head/);
});

test("blocks unapproved review and unready merge surfaces", () => {
  const unapproved = compileMergeGateFreshness({
    review_intake: review({
      ok: false,
      action: "wait_for_review_response",
      approvals: [],
      blockers: ["required review approval has not surfaced on the live head"],
    }),
    merge_readiness: readiness(),
    live_head_sha: head,
    gate_id: `merge-gate-pr-2:${head}:unapproved`,
    spent_gate_ids: [],
  });

  assert.equal(unapproved.ok, false);
  assert.equal(unapproved.action, "block_unapproved_review_gate");

  const unready = compileMergeGateFreshness({
    review_intake: review(),
    merge_readiness: readiness({
      ok: false,
      action: "wait_for_checks",
      blockers: ["Route Governor Proof is still pending"],
    }),
    live_head_sha: head,
    gate_id: `merge-gate-pr-2:${head}:unready`,
    spent_gate_ids: [],
  });

  assert.equal(unready.ok, false);
  assert.equal(unready.action, "block_unready_merge_gate");
});

test("blocks replayed gates and target drift", () => {
  const replay = compileMergeGateFreshness({
    review_intake: review(),
    merge_readiness: readiness(),
    live_head_sha: head,
    gate_id: `merge-gate-pr-2:${head}`,
    spent_gate_ids: [`merge-gate-pr-2:${head}`],
  });

  assert.equal(replay.ok, false);
  assert.equal(replay.action, "block_replayed_gate_id");

  const drift = compileMergeGateFreshness({
    review_intake: review(),
    merge_readiness: readiness({ pr_number: 99 }),
    live_head_sha: head,
    gate_id: `merge-gate-pr-2:${head}:drift`,
    spent_gate_ids: [],
  });

  assert.equal(drift.ok, false);
  assert.equal(drift.action, "block_target_mismatch");
});
