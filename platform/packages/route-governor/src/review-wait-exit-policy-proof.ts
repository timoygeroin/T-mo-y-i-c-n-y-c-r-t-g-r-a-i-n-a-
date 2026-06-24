import { routeReviewWaitExitPolicy } from "./review-wait-exit-policy.js";

const liveHead = "b47dc1389cdb0d0f4b4ab918c806f349b07f3a49";

const verdict = routeReviewWaitExitPolicy({
  active_branch: "monday-platform-genesis-01",
  live_head_sha: liveHead,
  last_status_readback_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
  spent_exit_ids: [],
  surface: {
    exit_id: "review-wait-exit-proof-live-head",
    branch: "monday-platform-genesis-01",
    head_sha: liveHead,
    pr_open: true,
    draft: false,
    mergeable: true,
    status_verdict: "passing_with_warnings",
    feedback_kind: "approved",
    feedback_ids: ["review-approval-proof"],
    final_review_surface_ids: [
      "final-review-authority-bundle",
      "review-request-command",
      "review-request-result-receipt",
    ],
  },
});

if (!verdict.ok || verdict.action !== "request_final_review") {
  throw new Error(`expected final-review request exit, received ${verdict.action}: ${verdict.blockers.join("; ")}`);
}

const blocked = routeReviewWaitExitPolicy({
  active_branch: "monday-platform-genesis-01",
  live_head_sha: liveHead,
  last_status_readback_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
  spent_exit_ids: [],
  surface: {
    exit_id: "review-wait-exit-proof-pending",
    branch: "monday-platform-genesis-01",
    head_sha: liveHead,
    pr_open: true,
    draft: false,
    mergeable: true,
    status_verdict: "passing_with_warnings",
    feedback_kind: "pending",
    feedback_ids: [],
    final_review_surface_ids: [
      "final-review-authority-bundle",
      "review-request-command",
      "review-request-result-receipt",
    ],
  },
});

if (blocked.ok || blocked.action !== "hold_review_wait") {
  throw new Error(`expected pending review wait hold, received ${blocked.action}`);
}

console.log("review wait exit policy proof passed");
