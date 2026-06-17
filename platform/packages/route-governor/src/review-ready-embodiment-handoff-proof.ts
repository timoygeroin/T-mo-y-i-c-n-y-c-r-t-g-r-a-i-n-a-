import assert from "node:assert/strict";

import {
  routeReviewReadyEmbodimentHandoff,
  type ReviewReadyEmbodimentCandidate,
  type ReviewReadyEmbodimentHandoffInput,
} from "./review-ready-embodiment-handoff.js";

const branch = "monday-platform-genesis-01";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "9ae5a1fc60ec272939b9f8965a2d95751342ac4d";

function candidate(overrides: Partial<ReviewReadyEmbodimentCandidate> = {}): ReviewReadyEmbodimentCandidate {
  return {
    candidate_id: "review-ready-embodiment-handoff-01",
    move_class: "external_platform_embodiment",
    branch,
    base_head_sha: liveHead,
    changed_files: [
      "platform/packages/route-governor/src/review-ready-embodiment-handoff.ts",
      "platform/packages/route-governor/src/review-ready-embodiment-handoff-proof.ts",
    ],
    executable_artifacts: ["routeReviewReadyEmbodimentHandoff"],
    routing_artifacts: ["review-ready handoff admits only executable embodiment, moved-head status, or exact blocker"],
    proof_artifacts: ["dist/review-ready-embodiment-handoff-proof.js"],
    ...overrides,
  };
}

function input(overrides: Partial<ReviewReadyEmbodimentHandoffInput> = {}): ReviewReadyEmbodimentHandoffInput {
  return {
    active_branch: branch,
    live_head_sha: liveHead,
    last_repaired_head_sha: repairedHead,
    last_status_readback_head_sha: repairedHead,
    pr_is_draft: false,
    resolved_boundary_ids: ["issue-1-closed-completed", "blocked:ci-status-readback-removed"],
    live_status_verdict: "passing_with_warnings",
    candidate: candidate(),
    ...overrides,
  };
}

const admitted = routeReviewReadyEmbodimentHandoff(input());
assert.equal(admitted.ok, true);
assert.equal(admitted.action, "admit_review_ready_embodiment");
assert.ok(admitted.retired_boundaries.includes(`repaired-head:${repairedHead}`));
assert.ok(admitted.decisive_evidence.some((item) => item.includes("review-ready-embodiment-handoff.ts")));

const duplicateReviewRequest = routeReviewReadyEmbodimentHandoff(
  input({ candidate: candidate({ move_class: "duplicate_review_request" }) }),
);
assert.equal(duplicateReviewRequest.ok, false);
assert.equal(duplicateReviewRequest.action, "block_non_progress_class");

const staleRepairedHead = routeReviewReadyEmbodimentHandoff(
  input({ candidate: candidate({ base_head_sha: repairedHead }) }),
);
assert.equal(staleRepairedHead.ok, false);
assert.equal(staleRepairedHead.action, "block_unretired_resolved_boundary");

const sameHeadStatusReplay = routeReviewReadyEmbodimentHandoff(
  input({
    live_head_sha: repairedHead,
    last_status_readback_head_sha: repairedHead,
    candidate: candidate({
      move_class: "fresh_status_readback",
      base_head_sha: repairedHead,
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      proof_artifacts: [],
    }),
  }),
);
assert.equal(sameHeadStatusReplay.ok, false);
assert.equal(sameHeadStatusReplay.action, "block_unretired_resolved_boundary");

const movedHeadStatus = routeReviewReadyEmbodimentHandoff(
  input({
    candidate: candidate({
      move_class: "fresh_status_readback",
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      proof_artifacts: [],
    }),
  }),
);
assert.equal(movedHeadStatus.ok, true);
assert.equal(movedHeadStatus.action, "admit_moved_head_status_readback");

const proofOnly = routeReviewReadyEmbodimentHandoff(
  input({
    candidate: candidate({
      changed_files: ["platform/packages/route-governor/src/review-ready-embodiment-handoff-proof.ts"],
    }),
  }),
);
assert.equal(proofOnly.ok, false);
assert.equal(proofOnly.action, "block_incomplete_embodiment");

const exactBlocker = routeReviewReadyEmbodimentHandoff(
  input({
    candidate: candidate({
      move_class: "exact_external_blocker",
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      proof_artifacts: [],
      blocker: "live-head status API unavailable for review-ready handoff",
    }),
  }),
);
assert.equal(exactBlocker.ok, true);
assert.equal(exactBlocker.action, "emit_exact_external_blocker");

console.log("review-ready embodiment handoff proof passed");
