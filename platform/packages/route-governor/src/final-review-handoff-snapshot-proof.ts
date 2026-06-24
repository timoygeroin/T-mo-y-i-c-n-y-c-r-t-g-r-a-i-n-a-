import { compileFinalReviewHandoffSnapshot } from "./final-review-handoff-snapshot.js";

const liveHead = "0672bb84ad602a55799149405869261986a5f631";

const verdict = compileFinalReviewHandoffSnapshot({
  active_branch: "monday-platform-genesis-01",
  live_head_sha: liveHead,
  snapshot_id: "final-review-handoff-proof-live-head",
  spent_snapshot_ids: [],
  requested_action: "request_final_review",
  status: {
    surface_id: "public-checks-live-head",
    branch: "monday-platform-genesis-01",
    head_sha: liveHead,
    verdict: "warning_only",
    warnings: ["Node.js 20 Actions deprecation notice"],
    evidence: ["current-head checks show proof examples succeeded", "warning is maintenance-only"],
  },
  mergeability: {
    surface_id: "live-pr-metadata",
    branch: "monday-platform-genesis-01",
    head_sha: liveHead,
    mergeable: true,
    evidence: ["PR #2 open non-draft mergeable true"],
  },
  blockers: {
    surface_id: "blocker-retirement-readback",
    branch: "monday-platform-genesis-01",
    head_sha: liveHead,
    verdict: "retired",
    blocker_ids: [],
    evidence: ["Issue #1 closed", "blocked: ci-status-readback removed"],
  },
  feedback: {
    surface_id: "review-feedback-delta",
    branch: "monday-platform-genesis-01",
    head_sha: liveHead,
    verdict: "none",
    reviewers: [],
    repair_items: [],
    evidence: ["no live-head review repair item surfaced"],
  },
});

if (!verdict.ok) {
  throw new Error(`final review handoff snapshot proof failed: ${verdict.blockers.join("; ")}`);
}

console.log(JSON.stringify(verdict, null, 2));
