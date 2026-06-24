import { routePostStatusFinalization, type PostStatusFinalizationInput } from "./post-status-finalization-router.js";

const liveHead = "21acec07f485b12f6933a1f894a035880e400a02";

function baseInput(overrides: Partial<PostStatusFinalizationInput> = {}): PostStatusFinalizationInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    repaired_historical_heads: ["b38ea247602ae8ebba80c4120ad03b41b26bd841"],
    spent_action_ids: [],
    status_surface: {
      branch: "monday-platform-genesis-01",
      head_sha: liveHead,
      verdict: "passing_with_warnings",
      successful_surfaces: ["Route governor proof examples succeeded", "PR Head Status Readback succeeded"],
      warning_surfaces: ["Node.js 20 notice remains warning-only"],
      blocking_surfaces: [],
      pending_surfaces: [],
    },
    candidate: {
      action_id: "post-status-review-request",
      requested_action: "request_review",
      branch: "monday-platform-genesis-01",
      base_head_sha: liveHead,
      review_surface: "PR #2 ready-for-review surface",
      changed_files: [],
      behavior_artifacts: [],
      routing_artifacts: [],
      proof_artifacts: [],
    },
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

export function runPostStatusFinalizationRouterProof(): void {
  const review = routePostStatusFinalization(baseInput());
  expectOk("post-status review request", review.ok, review.blockers);
  if (review.action !== "admit_review_request") throw new Error(`unexpected review action: ${review.action}`);

  const stale = routePostStatusFinalization(
    baseInput({
      status_surface: {
        ...baseInput().status_surface,
        head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
      },
    }),
  );
  expectBlock("stale repaired-head status", stale.ok, stale.blockers, liveHead);

  const warningMaintenance = routePostStatusFinalization(
    baseInput({
      candidate: {
        ...baseInput().candidate,
        action_id: "warning-maintenance",
        requested_action: "warning_maintenance",
      },
    }),
  );
  expectBlock("warning maintenance detour", warningMaintenance.ok, warningMaintenance.blockers, "warning_maintenance");

  const embodiment = routePostStatusFinalization(
    baseInput({
      candidate: {
        ...baseInput().candidate,
        action_id: "post-status-next-embodiment",
        requested_action: "external_platform_embodiment",
        review_surface: undefined,
        changed_files: ["platform/packages/route-governor/src/post-status-finalization-router.ts"],
        behavior_artifacts: ["routePostStatusFinalization"],
        routing_artifacts: ["post-status finalization router"],
        proof_artifacts: ["post-status-finalization-router.test.ts"],
      },
    }),
  );
  expectOk("post-status executable embodiment", embodiment.ok, embodiment.blockers);
  if (embodiment.action !== "admit_next_embodiment") {
    throw new Error(`unexpected embodiment action: ${embodiment.action}`);
  }
}

runPostStatusFinalizationRouterProof();
