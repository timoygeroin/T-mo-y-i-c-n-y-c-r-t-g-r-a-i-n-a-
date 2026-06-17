import { admitReviewThreadResolution, type ReviewThreadResolutionAdmissionInput } from "./review-thread-resolution-admission.js";

function input(overrides: Partial<ReviewThreadResolutionAdmissionInput> = {}): ReviewThreadResolutionAdmissionInput {
  const liveHead = "0d43612629dd1ee5553eff5cb81fb0dac7c77875";
  return {
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    required_approval_count: 1,
    approvals: ["reviewer-a"],
    change_requests: [],
    review_threads: [
      {
        thread_id: "thread-1",
        path: "platform/packages/route-governor/src/review-thread-resolution-admission.ts",
        head_sha: liveHead,
        state: "resolved",
        reviewer: "reviewer-a",
        last_comment_id: "comment-1",
      },
    ],
    ...overrides,
  };
}

function expectAction(name: string, expectedAction: string, ok: boolean): void {
  const verdict = admitReviewThreadResolution(input());
  if (verdict.action !== expectedAction || verdict.ok !== ok) {
    throw new Error(`${name} expected ${expectedAction}/${ok}, got ${verdict.action}/${verdict.ok}`);
  }
}

export function runReviewThreadResolutionAdmissionProof(): void {
  expectAction("resolved live threads admit merge readiness", "admit_merge_readiness_after_threads", true);

  const unresolved = admitReviewThreadResolution(
    input({ review_threads: [{ ...input().review_threads[0], state: "unresolved" }] }),
  );
  if (unresolved.ok || unresolved.action !== "route_to_thread_resolution") {
    throw new Error(`unresolved live thread should route to thread resolution, got ${unresolved.action}`);
  }
  if (!unresolved.blockers.some((blocker) => blocker.includes("unresolved review thread thread-1"))) {
    throw new Error(`unresolved thread blocker missing: ${unresolved.blockers.join("; ")}`);
  }

  const stale = admitReviewThreadResolution(
    input({ review_threads: [{ ...input().review_threads[0], head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }] }),
  );
  if (stale.ok || stale.action !== "block_stale_review_thread_surface") {
    throw new Error(`stale thread surface should block, got ${stale.action}`);
  }

  const changesRequested = admitReviewThreadResolution(input({ change_requests: ["reviewer-a"] }));
  if (changesRequested.ok || changesRequested.action !== "route_to_review_repair") {
    throw new Error(`changes requested should route to repair, got ${changesRequested.action}`);
  }

  const missingSurface = admitReviewThreadResolution(input({ review_threads: [] }));
  if (missingSurface.ok || missingSurface.action !== "block_missing_review_thread_surface") {
    throw new Error(`missing thread surface should block, got ${missingSurface.action}`);
  }
}

runReviewThreadResolutionAdmissionProof();
