import { routePostReviewConvergence, type PostReviewConvergenceInput } from "./post-review-convergence-router.js";

const branch = "monday-platform-genesis-01";
const liveHead = "post-review-convergence-head";

function baseInput(overrides: Partial<PostReviewConvergenceInput> = {}): PostReviewConvergenceInput {
  return {
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    active_branch: branch,
    candidate_branch: branch,
    live_head_sha: liveHead,
    draft: false,
    mergeable: true,
    required_approval_count: 1,
    requested_intent: "merge_command",
    status_surface: {
      surface_id: "checks:post-review-convergence",
      head_sha: liveHead,
      verdict: "passing_with_warnings",
      decisive_successes: ["Monday Platform CI succeeded", "Route Governor Proof succeeded"],
      blockers: [],
      warnings: ["Node.js 20 Actions deprecation notice"],
    },
    review_surfaces: [{ reviewer: "external-reviewer", head_sha: liveHead, state: "approved" }],
    ...overrides,
  };
}

function expectOk(name: string, ok: boolean, blockers: string[]): void {
  if (!ok) throw new Error(`${name} should pass, blocked by: ${blockers.join("; ")}`);
}

function expectBlock(name: string, ok: boolean, blockers: string[], expected: string): void {
  if (ok) throw new Error(`${name} should block, but passed`);
  if (!blockers.some((blocker) => blocker.includes(expected))) {
    throw new Error(`${name} did not block for ${expected}; blockers: ${blockers.join("; ")}`);
  }
}

export function runPostReviewConvergenceRouterProof(): void {
  const mergeWindow = routePostReviewConvergence(baseInput());
  expectOk("post-review merge window", mergeWindow.ok, mergeWindow.blockers);
  if (mergeWindow.action !== "admit_merge_window") {
    throw new Error(`unexpected merge window action: ${mergeWindow.action}`);
  }
  if (!mergeWindow.warnings.includes("Node.js 20 Actions deprecation notice")) {
    throw new Error("warning-only status notice was not preserved as non-blocking");
  }

  const staleStatus = routePostReviewConvergence(
    baseInput({
      status_surface: {
        ...baseInput().status_surface,
        surface_id: "checks:repaired-head",
        head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
      },
    }),
  );
  expectBlock("stale status surface", staleStatus.ok, staleStatus.blockers, "not post-review-convergence-head");

  const warningMaintenance = routePostReviewConvergence(baseInput({ requested_intent: "warning_maintenance" }));
  expectBlock("warning maintenance", warningMaintenance.ok, warningMaintenance.blockers, "warning_maintenance");

  const reviewRepair = routePostReviewConvergence(
    baseInput({
      review_surfaces: [{ reviewer: "external-reviewer", head_sha: liveHead, state: "changes_requested" }],
    }),
  );
  expectOk("review repair route", reviewRepair.ok, reviewRepair.blockers);
  if (reviewRepair.action !== "route_to_review_repair") {
    throw new Error(`unexpected review repair action: ${reviewRepair.action}`);
  }

  const staleReviewOnly = routePostReviewConvergence(
    baseInput({
      review_surfaces: [
        {
          reviewer: "external-reviewer",
          head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
          state: "approved",
        },
      ],
    }),
  );
  expectBlock("stale review only", staleReviewOnly.ok, staleReviewOnly.blockers, "not bound to live head");

  const waitReview = routePostReviewConvergence(baseInput({ review_surfaces: [] }));
  expectOk("wait review route", waitReview.ok, waitReview.blockers);
  if (waitReview.action !== "wait_for_live_review") {
    throw new Error(`unexpected wait action: ${waitReview.action}`);
  }
}

runPostReviewConvergenceRouterProof();
