import assert from "node:assert/strict";

import {
  compilePrBodyHeadDriftBoundary,
  type PrBodyHeadDriftBoundaryInput,
} from "./pr-body-head-drift-boundary.js";

const branch = "monday-platform-genesis-01";
const liveHead = "15e9293960ed8af0fc9d02bd3a385141af1644c7";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function input(overrides: Partial<PrBodyHeadDriftBoundaryInput> = {}): PrBodyHeadDriftBoundaryInput {
  return {
    active_branch: branch,
    live_pr_branch: branch,
    live_pr_head_sha: liveHead,
    resolved_repaired_head_sha: repairedHead,
    repaired_head_status_resolved: true,
    blocker_issue_closed: true,
    blocker_label_present: false,
    pr_body_claims: [
      {
        claim_id: "resolved-repaired-head",
        kind: "repaired_head",
        head_sha: repairedHead,
        verdict: "resolved",
        evidence: "repaired-head checks succeeded and blocker was closed",
      },
      {
        claim_id: "stale-current-head-summary",
        kind: "current_head",
        head_sha: "df3a4035d6841ae19cc32443f0d4ef11449e65ac",
        verdict: "failing",
        evidence: "PR body summary names an older moved head as current",
      },
    ],
    ...overrides,
  };
}

const drift = compilePrBodyHeadDriftBoundary(input());
assert.equal(drift.ok, true);
assert.equal(drift.action, "quarantine_pr_body_head_summary");
assert.deepEqual(drift.historical_claim_ids, ["resolved-repaired-head"]);
assert.deepEqual(drift.quarantined_claim_ids, ["stale-current-head-summary"]);
assert.match(drift.next_route, /live PR head/);

const aligned = compilePrBodyHeadDriftBoundary(
  input({
    pr_body_claims: [
      {
        claim_id: "live-current-head",
        kind: "current_head",
        head_sha: liveHead,
        verdict: "unknown",
        evidence: "PR body names the live head without claiming status completion",
      },
      {
        claim_id: "resolved-repaired-head",
        kind: "status_readback_head",
        head_sha: repairedHead,
        verdict: "resolved",
        evidence: "resolved repaired-head status remains historical context",
      },
    ],
  }),
);
assert.equal(aligned.ok, true);
assert.equal(aligned.action, "accept_pr_body_live_head_context");
assert.deepEqual(aligned.live_claim_ids, ["live-current-head"]);
assert.deepEqual(aligned.historical_claim_ids, ["resolved-repaired-head"]);
assert.deepEqual(aligned.quarantined_claim_ids, []);

const wrongBranch = compilePrBodyHeadDriftBoundary(input({ live_pr_branch: "main" }));
assert.equal(wrongBranch.ok, false);
assert.equal(wrongBranch.action, "block_branch_mismatch");

console.log("pr body head drift boundary proof passed");
