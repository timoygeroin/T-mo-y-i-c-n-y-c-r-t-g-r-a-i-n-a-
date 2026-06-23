import assert from "node:assert/strict";
import { test } from "node:test";

import {
  routeReviewWaitBarrier,
  type ReviewWaitBarrierInput,
  type ReviewWaitCandidate,
} from "./review-wait-barrier.js";

const branch = "monday-platform-genesis-01";
const liveHead = "8ef627473f867c79806ddcc8a3b5a33b7a2b71b3";
const priorStatusHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function candidate(overrides: Partial<ReviewWaitCandidate> = {}): ReviewWaitCandidate {
  return {
    move_class: "external_platform_embodiment",
    branch,
    base_head_sha: liveHead,
    changed_files: ["platform/packages/route-governor/src/review-wait-barrier.ts"],
    executable_artifacts: ["routeReviewWaitBarrier"],
    routing_artifacts: ["review-ready scheduled continuations hold unless review feedback or live failure authorizes a write"],
    proof_artifacts: ["review-wait-barrier.test.ts"],
    ...overrides,
  };
}

function input(overrides: Partial<ReviewWaitBarrierInput> = {}): ReviewWaitBarrierInput {
  return {
    active_branch: branch,
    live_head_sha: liveHead,
    last_status_readback_head_sha: priorStatusHead,
    pr_open: true,
    draft: false,
    mergeable: true,
    status_verdict: "passing_with_warnings",
    review_feedback_pending: true,
    candidate: candidate(),
    ...overrides,
  };
}

test("holds review-ready scheduled embodiment when no review feedback or live failure authorizes a write", () => {
  const verdict = routeReviewWaitBarrier(input());

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "hold_for_review_feedback");
  assert.equal(verdict.head_sha, liveHead);
  assert.deepEqual(verdict.blockers, ["no live review feedback or live failure authorizes another embodiment write"]);
});

test("admits an embodiment bound to concrete review feedback", () => {
  const verdict = routeReviewWaitBarrier(
    input({ candidate: candidate({ review_feedback_ids: ["review-thread-17"] }) }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_review_bound_embodiment");
  assert.ok(verdict.decisive_evidence.includes("review feedback review-thread-17"));
});

test("admits an embodiment bound to a live failure signature", () => {
  const verdict = routeReviewWaitBarrier(
    input({ candidate: candidate({ live_failure_signature: "Route governor proof examples exit 2" }) }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_review_bound_embodiment");
  assert.ok(verdict.decisive_evidence.includes("live failure Route governor proof examples exit 2"));
});

test("routes moved head status readback without treating it as another embodiment", () => {
  const verdict = routeReviewWaitBarrier(
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

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "read_moved_head_status");
  assert.ok(verdict.decisive_evidence.includes(`head moved from ${priorStatusHead} to ${liveHead}`));
});

test("blocks stale-base candidates before review-wait routing", () => {
  const verdict = routeReviewWaitBarrier(
    input({ candidate: candidate({ base_head_sha: priorStatusHead }) }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_head_mismatch");
  assert.deepEqual(verdict.blockers, [`candidate base ${priorStatusHead} is not live PR head ${liveHead}`]);
});

test("blocks unclear status before unbound embodiment work", () => {
  const verdict = routeReviewWaitBarrier(input({ status_verdict: "pending" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_unresolved_status");
  assert.deepEqual(verdict.blockers, ["status verdict pending is not clear for review wait"]);
});

test("blocks proof-only review-bound embodiment candidates", () => {
  const verdict = routeReviewWaitBarrier(
    input({
      candidate: candidate({
        review_feedback_ids: ["review-thread-17"],
        changed_files: ["platform/packages/route-governor/src/review-wait-barrier-proof.ts"],
      }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_embodiment");
  assert.ok(verdict.blockers.includes("review-wait embodiment is proof-only and has no behavior file"));
});

test("requires exact blocker text for blocker candidates", () => {
  const verdict = routeReviewWaitBarrier(
    input({
      candidate: candidate({
        move_class: "exact_external_blocker",
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
      }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_exact_blocker");
});
