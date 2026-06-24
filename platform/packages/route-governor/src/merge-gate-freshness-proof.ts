import assert from "node:assert/strict";

import { compileMergeGateFreshness } from "./merge-gate-freshness.js";
import type { MergeReadinessVerdict } from "./merge-readiness.js";
import type { ReviewResponseIntakeVerdict } from "./review-response-intake.js";

const liveHead = "e20bca61bca91fcf77a7167a0418d1d0592ec471";

const review: ReviewResponseIntakeVerdict = {
  ok: true,
  action: "route_to_merge_gate",
  repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
  pr_number: 2,
  branch: "monday-platform-genesis-01",
  head_sha: liveHead,
  approvals: ["external-reviewer"],
  change_requests: [],
  pending_reviewers: [],
  decisive_evidence: [`receipt head ${liveHead}`, "approved by external-reviewer"],
  blockers: [],
  next_route: "enter merge gate only after live-head status and mergeability are still current",
};

const readiness: MergeReadinessVerdict = {
  ok: true,
  action: "merge_ready",
  repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
  pr_number: 2,
  branch: "monday-platform-genesis-01",
  head_sha: liveHead,
  decisive_evidence: ["current-head checks succeeded", "GitHub mergeability true"],
  blockers: [],
  warnings: ["Node.js 20 Actions deprecation notice"],
  next_route: "request final review or merge through the authorized GitHub boundary",
};

const admitted = compileMergeGateFreshness({
  review_intake: review,
  merge_readiness: readiness,
  live_head_sha: liveHead,
  gate_id: `merge-gate-pr-2:${liveHead}`,
  spent_gate_ids: [],
});

assert.equal(admitted.ok, true);
assert.equal(admitted.action, "admit_fresh_merge_gate");
assert.equal(admitted.next_route.includes("do not let review approval, status, or mergeability travel across a later head move"), true);

const staleReview = compileMergeGateFreshness({
  review_intake: { ...review, head_sha: "stale-review-head" },
  merge_readiness: readiness,
  live_head_sha: liveHead,
  gate_id: `merge-gate-pr-2:${liveHead}:stale-review`,
  spent_gate_ids: [],
});

assert.equal(staleReview.ok, false);
assert.equal(staleReview.action, "block_stale_review_gate");

const staleReadiness = compileMergeGateFreshness({
  review_intake: review,
  merge_readiness: { ...readiness, head_sha: "stale-readiness-head" },
  live_head_sha: liveHead,
  gate_id: `merge-gate-pr-2:${liveHead}:stale-readiness`,
  spent_gate_ids: [],
});

assert.equal(staleReadiness.ok, false);
assert.equal(staleReadiness.action, "block_stale_readiness_gate");

const replay = compileMergeGateFreshness({
  review_intake: review,
  merge_readiness: readiness,
  live_head_sha: liveHead,
  gate_id: `merge-gate-pr-2:${liveHead}`,
  spent_gate_ids: [`merge-gate-pr-2:${liveHead}`],
});

assert.equal(replay.ok, false);
assert.equal(replay.action, "block_replayed_gate_id");
