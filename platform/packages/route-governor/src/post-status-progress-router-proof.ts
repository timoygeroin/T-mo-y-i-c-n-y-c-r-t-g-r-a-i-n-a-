import { routePostStatusProgress, type PostStatusProgressRouterInput } from "./post-status-progress-router.js";

const liveHead = "ec94ebdf38feb3ad1f80b3a6f93bf9f6e90b12e0";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function baseInput(overrides: Partial<PostStatusProgressRouterInput> = {}): PostStatusProgressRouterInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    previous_status_head_sha: liveHead,
    previous_check_run_ids: ["route-governor-proof:27049651469"],
    repaired_historical_heads: [repairedHead],
    route_id: "post-status-progress-route-proof",
    spent_route_ids: [],
    requested_next_action: "external_platform_embodiment",
    status_surfaces: [
      {
        surface_id: "live-head-warning-only-status",
        branch: "monday-platform-genesis-01",
        head_sha: liveHead,
        conclusion: "warning_only",
        check_run_ids: ["route-governor-proof:27049651469"],
        evidence: ["Route Governor Proof succeeded", "Node.js 20 notice remains warning-only"],
      },
    ],
    embodiment_candidate: {
      branch: "monday-platform-genesis-01",
      base_head_sha: liveHead,
      changed_files: ["platform/packages/route-governor/src/post-status-progress-router.ts"],
      behavior_artifacts: ["routePostStatusProgress"],
      routing_artifacts: ["three-class post-status progress gate"],
      proof_artifacts: ["post-status-progress-router-proof"],
      expected_result_head_sha: "post-status-progress-result-head",
    },
    ...overrides,
  };
}

function expectPass(name: string, ok: boolean, action: string, expectedAction: string, blockers: string[]): void {
  if (!ok) throw new Error(`${name} should pass, blocked by: ${blockers.join("; ")}`);
  if (action !== expectedAction) throw new Error(`${name} used ${action}, expected ${expectedAction}`);
}

function expectBlock(name: string, ok: boolean, blockers: string[], expected: string): void {
  if (ok) throw new Error(`${name} should block, but passed`);
  if (!blockers.some((blocker) => blocker.includes(expected))) {
    throw new Error(`${name} did not block for ${expected}; blockers: ${blockers.join("; ")}`);
  }
}

export function runPostStatusProgressRouterProof(): void {
  const embodiment = routePostStatusProgress(baseInput());
  expectPass("post-status embodiment", embodiment.ok, embodiment.action, "admit_post_status_embodiment", embodiment.blockers);
  if (embodiment.required_status_head_sha !== "post-status-progress-result-head") {
    throw new Error("post-status embodiment did not bind the next status head to the expected result head");
  }

  const repairedReuse = routePostStatusProgress(
    baseInput({
      status_surfaces: [
        {
          surface_id: "repaired-head-seven-checks",
          branch: "monday-platform-genesis-01",
          head_sha: repairedHead,
          conclusion: "success",
          check_run_ids: ["27049650678"],
          evidence: ["seven repaired-head checks succeeded"],
        },
      ],
    }),
  );
  expectBlock("repaired head status reuse", repairedReuse.ok, repairedReuse.blockers, "repaired historical head");

  const duplicateStatus = routePostStatusProgress(
    baseInput({ requested_next_action: "fresh_status_readback", embodiment_candidate: undefined }),
  );
  expectBlock("duplicate status readback", duplicateStatus.ok, duplicateStatus.blockers, "moved PR head or new check runs");

  const movedHeadStatus = routePostStatusProgress(
    baseInput({
      live_head_sha: "3bf8e07dce32e59accf776357fb22278f57ba3f5",
      previous_status_head_sha: liveHead,
      requested_next_action: "fresh_status_readback",
      status_surfaces: [],
      embodiment_candidate: undefined,
    }),
  );
  expectPass("moved-head status readback", movedHeadStatus.ok, movedHeadStatus.action, "admit_fresh_status_readback", movedHeadStatus.blockers);

  const nonProgress = routePostStatusProgress(baseInput({ requested_next_action: "duplicate_status_summary" }));
  expectBlock("duplicate status summary", nonProgress.ok, nonProgress.blockers, "duplicate_status_summary");

  const exactBlocker = routePostStatusProgress(
    baseInput({
      requested_next_action: "exact_external_blocker",
      embodiment_candidate: undefined,
      exact_blocker: "live-head status API unavailable for the moved head",
    }),
  );
  expectPass("exact external blocker", exactBlocker.ok, exactBlocker.action, "emit_exact_external_blocker", exactBlocker.blockers);
}

runPostStatusProgressRouterProof();
