import assert from "node:assert/strict";

import { routePostReadyReviewWindow, type PostReadyReviewWindowInput, type PostReadySurface } from "./post-ready-review-window-router.js";
import type { ReviewResponseIntakeVerdict } from "./review-response-intake.js";
import type { ReviewTargetPolicyVerdict } from "./review-target-policy.js";

const head = "72184bd40b0187fdcd6d7316d0493c85128965a0";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function surface(overrides: Partial<PostReadySurface> = {}): PostReadySurface {
  return {
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch: "monday-platform-genesis-01",
    live_head_sha: head,
    repaired_head_sha: repairedHead,
    status_verdict: "passing_with_warnings",
    status_surface_id: "public-checks:27049650678-27049651467",
    decisive_successes: ["seven repaired-head checks succeeded"],
    warnings: ["Node.js 20 Actions deprecation notice"],
    blocker_ids_retired: ["issue-1-ci-status-readback", "blocked:ci-status-readback"],
    pr_ready: true,
    mergeable: true,
    ...overrides,
  };
}

function reviewTargets(overrides: Partial<ReviewTargetPolicyVerdict> = {}): ReviewTargetPolicyVerdict {
  return {
    ok: true,
    action: "admit_external_review_targets",
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch: "monday-platform-genesis-01",
    head_sha: head,
    reviewers: ["external-reviewer"],
    team_reviewers: [],
    target_set_id: `monday-platform-genesis-01@${head}|user:external-reviewer|`,
    decisive_evidence: [`live head ${head}`, "reviewer:external-reviewer"],
    blockers: [],
    next_route: "compile the GitHub review request command only with these admitted external targets and this live head",
    ...overrides,
  };
}

function reviewResponse(overrides: Partial<ReviewResponseIntakeVerdict> = {}): ReviewResponseIntakeVerdict {
  return {
    ok: false,
    action: "wait_for_review_response",
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch: "monday-platform-genesis-01",
    head_sha: head,
    approvals: [],
    change_requests: [],
    pending_reviewers: ["external-reviewer"],
    decisive_evidence: [`receipt head ${head}`],
    blockers: ["required review approval has not surfaced on the live head"],
    next_route: "wait for live-head review response or emit a precise external review blocker if one appears",
    ...overrides,
  };
}

function input(overrides: Partial<PostReadyReviewWindowInput> = {}): PostReadyReviewWindowInput {
  return {
    surface: surface(),
    candidate_branch: "monday-platform-genesis-01",
    ...overrides,
  };
}

const targetRequest = routePostReadyReviewWindow(input({ review_targets: reviewTargets() }));
assert.equal(targetRequest.ok, true);
assert.equal(targetRequest.action, "request_review_on_live_head");
assert.equal(targetRequest.head_sha, head);
assert.deepEqual(targetRequest.blockers, []);
assert(targetRequest.decisive_evidence.includes("reviewer:external-reviewer"));
assert.deepEqual(targetRequest.retired_heads, [repairedHead]);

const noTarget = routePostReadyReviewWindow(input());
assert.equal(noTarget.ok, false);
assert.equal(noTarget.action, "block_missing_review_target");
assert.deepEqual(noTarget.blockers, [
  "post-ready PR has no admitted external reviewer target and no non-repeated embodiment candidate",
]);

const embodiment = routePostReadyReviewWindow(
  input({
    embodiment: {
      candidate_id: "post-ready-review-window-router",
      artifact_class: "post_ready_review_window_router",
      changed_files: ["platform/packages/route-governor/src/post-ready-review-window-router.ts"],
      executable_artifacts: ["routePostReadyReviewWindow"],
      routing_artifacts: ["post-ready review-window route selection"],
      proof_artifacts: ["platform/packages/route-governor/src/post-ready-review-window-router-proof.ts"],
      spent_artifact_classes: ["post_status_embodiment_queue", "post_repair_merge_handoff"],
    },
  }),
);
assert.equal(embodiment.ok, true);
assert.equal(embodiment.action, "route_to_external_embodiment");
assert(embodiment.decisive_evidence.includes("routePostReadyReviewWindow"));

const repeatedEmbodiment = routePostReadyReviewWindow(
  input({
    embodiment: {
      candidate_id: "post-ready-review-window-router",
      artifact_class: "post_ready_review_window_router",
      changed_files: ["platform/packages/route-governor/src/post-ready-review-window-router.ts"],
      executable_artifacts: ["routePostReadyReviewWindow"],
      routing_artifacts: ["post-ready review-window route selection"],
      proof_artifacts: ["platform/packages/route-governor/src/post-ready-review-window-router-proof.ts"],
      spent_artifact_classes: ["post_ready_review_window_router"],
    },
  }),
);
assert.equal(repeatedEmbodiment.ok, false);
assert.equal(repeatedEmbodiment.action, "block_incomplete_embodiment");
assert.deepEqual(repeatedEmbodiment.blockers, [
  "post-ready embodiment artifact class already spent: post_ready_review_window_router",
]);

const waiting = routePostReadyReviewWindow(input({ review_response: reviewResponse() }));
assert.equal(waiting.ok, false);
assert.equal(waiting.action, "route_to_review_response_wait");
assert.deepEqual(waiting.blockers, ["required review approval has not surfaced on the live head"]);

const approved = routePostReadyReviewWindow(
  input({
    review_response: reviewResponse({
      ok: true,
      action: "route_to_merge_gate",
      approvals: ["external-reviewer"],
      pending_reviewers: [],
      blockers: [],
      decisive_evidence: [`receipt head ${head}`, "approved by external-reviewer"],
    }),
  }),
);
assert.equal(approved.ok, true);
assert.equal(approved.action, "route_to_merge_gate");
assert(approved.decisive_evidence.includes("approved by external-reviewer"));

const staleTarget = routePostReadyReviewWindow(input({ review_targets: reviewTargets({ head_sha: repairedHead }) }));
assert.equal(staleTarget.ok, false);
assert.equal(staleTarget.action, "block_stale_surface");
assert.deepEqual(staleTarget.blockers, [`review target policy head ${repairedHead} is not live head ${head}`]);

const notReady = routePostReadyReviewWindow(input({ surface: surface({ pr_ready: false }) }));
assert.equal(notReady.ok, false);
assert.equal(notReady.action, "block_unready_pr");
assert.deepEqual(notReady.blockers, ["PR is not ready for review"]);

console.log("post-ready review window router proof passed");
