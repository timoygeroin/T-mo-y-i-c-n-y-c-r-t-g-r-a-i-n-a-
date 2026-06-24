import { routeReviewWaitBarrier } from "./review-wait-barrier.js";

const liveHead = "8ef627473f867c79806ddcc8a3b5a33b7a2b71b3";

const verdict = routeReviewWaitBarrier({
  active_branch: "monday-platform-genesis-01",
  live_head_sha: liveHead,
  last_status_readback_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
  pr_open: true,
  draft: false,
  mergeable: true,
  status_verdict: "passing_with_warnings",
  review_feedback_pending: true,
  candidate: {
    move_class: "external_platform_embodiment",
    branch: "monday-platform-genesis-01",
    base_head_sha: liveHead,
    changed_files: ["platform/packages/route-governor/src/unbound-scheduled-write.ts"],
    executable_artifacts: ["unbound scheduled embodiment candidate"],
    routing_artifacts: ["review-ready branch should preserve review wait without feedback"],
    proof_artifacts: ["review-wait-barrier-proof.ts"],
  },
});

if (verdict.ok || verdict.action !== "hold_for_review_feedback") {
  throw new Error(`expected review wait hold, received ${verdict.action}`);
}

console.log("review wait barrier proof passed");
