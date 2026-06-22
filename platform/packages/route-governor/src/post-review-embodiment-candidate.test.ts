import assert from "node:assert/strict";
import test from "node:test";

import {
  admitPostReviewEmbodimentCandidate,
  type PostReviewEmbodimentCandidateInput,
} from "./post-review-embodiment-candidate.js";

const BRANCH = "monday-platform-genesis-01";
const HEAD = "c66fa41e76c093125437aaa7fa7fea81eff3feca";
const TARGET_FILE = "platform/packages/route-governor/src/review-feedback-delta-router.ts";

function input(overrides: Partial<PostReviewEmbodimentCandidateInput> = {}): PostReviewEmbodimentCandidateInput {
  return {
    active_branch: BRANCH,
    live_head_sha: HEAD,
    route_id: "post-review-embodiment-candidate",
    spent_route_ids: [],
    spent_candidate_signatures: [],
    requested_next_action: "external_platform_embodiment",
    review_delta: {
      delta_id: "review-delta-1",
      branch: BRANCH,
      head_sha: HEAD,
      kind: "changes_requested",
      file_paths: [TARGET_FILE],
      reviewer: "reviewer-a",
      evidence: ["file-bound changes requested"],
    },
    candidate: {
      candidate_id: "review-bound-repair",
      branch: BRANCH,
      base_head_sha: HEAD,
      candidate_signature: "review-delta-1:review-feedback-delta-router:behavior-proof",
      changed_files: [TARGET_FILE, "platform/packages/route-governor/src/post-review-embodiment-candidate.ts"],
      behavior_exports: ["admitPostReviewEmbodimentCandidate"],
      routing_artifacts: ["post-review candidate must cover every file-bound review target"],
      proof_artifacts: ["post-review-embodiment-candidate.test.ts"],
    },
    ...overrides,
  };
}

test("admits a live-head executable candidate bound to a concrete review delta", () => {
  const verdict = admitPostReviewEmbodimentCandidate(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_post_review_embodiment");
  assert.equal(verdict.admitted_candidate_signature, "review-delta-1:review-feedback-delta-router:behavior-proof");
  assert.ok(verdict.decisive_evidence.includes(`covers review target ${TARGET_FILE}`));
});

test("blocks review deltas from stale heads", () => {
  const verdict = admitPostReviewEmbodimentCandidate(
    input({
      review_delta: {
        delta_id: "stale-review-delta",
        branch: BRANCH,
        head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
        kind: "changes_requested",
        file_paths: [TARGET_FILE],
        evidence: ["stale repaired-head review"],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_head_mismatch");
});

test("blocks metadata rereads from consuming review feedback as progress", () => {
  const verdict = admitPostReviewEmbodimentCandidate(input({ requested_next_action: "metadata_reread" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_progress_action");
});

test("blocks approvals from being treated as repair embodiment deltas", () => {
  const verdict = admitPostReviewEmbodimentCandidate(
    input({
      review_delta: {
        delta_id: "approval-delta",
        branch: BRANCH,
        head_sha: HEAD,
        kind: "approval",
        file_paths: [TARGET_FILE],
        evidence: ["approved"],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_actionable_review_delta");
});

test("blocks vague review feedback without a file-bound target", () => {
  const verdict = admitPostReviewEmbodimentCandidate(
    input({
      review_delta: {
        delta_id: "vague-delta",
        branch: BRANCH,
        head_sha: HEAD,
        kind: "changes_requested",
        file_paths: [],
        evidence: ["please revise"],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_unbounded_review_delta");
});

test("blocks candidates that do not cover the review target files", () => {
  const verdict = admitPostReviewEmbodimentCandidate(
    input({
      candidate: {
        candidate_id: "unbound-repair",
        branch: BRANCH,
        base_head_sha: HEAD,
        candidate_signature: "unbound-review-repair",
        changed_files: ["platform/packages/route-governor/src/post-review-embodiment-candidate.ts"],
        behavior_exports: ["admitPostReviewEmbodimentCandidate"],
        routing_artifacts: ["unbound route"],
        proof_artifacts: ["post-review-embodiment-candidate.test.ts"],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_unbound_candidate_files");
});

test("blocks repeated semantic candidate signatures", () => {
  const verdict = admitPostReviewEmbodimentCandidate(
    input({ spent_candidate_signatures: ["review-delta-1:review-feedback-delta-router:behavior-proof"] }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_spent_candidate_signature");
});

test("admits an exact review blocker without pretending it moved the branch", () => {
  const verdict = admitPostReviewEmbodimentCandidate(
    input({
      requested_next_action: "exact_external_blocker",
      candidate: undefined,
      exact_blocker: "live-head review feedback lacks file-bound targets",
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "emit_exact_review_blocker");
  assert.deepEqual(verdict.blockers, ["live-head review feedback lacks file-bound targets"]);
});
