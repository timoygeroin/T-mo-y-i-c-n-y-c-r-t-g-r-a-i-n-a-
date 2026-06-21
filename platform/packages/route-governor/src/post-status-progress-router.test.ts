import { describe, it } from "node:test";
import assert from "node:assert/strict";

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
    route_id: "post-status-progress-route-001",
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

describe("routePostStatusProgress", () => {
  it("admits a behavior-bearing post-status embodiment from the live head", () => {
    const verdict = routePostStatusProgress(baseInput());

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "admit_post_status_embodiment");
    assert.equal(verdict.required_status_head_sha, "post-status-progress-result-head");
    assert.ok(verdict.decisive_evidence.includes("routePostStatusProgress"));
  });

  it("blocks repaired-head status authority after the live head moved", () => {
    const verdict = routePostStatusProgress(
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

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_repaired_head_authority");
    assert.match(verdict.blockers.join("; "), /repaired historical head/);
  });

  it("blocks non-progress route classes by name", () => {
    const verdict = routePostStatusProgress(baseInput({ requested_next_action: "metadata_reread" }));

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_non_progress_action");
    assert.match(verdict.blockers.join("; "), /metadata_reread/);
  });

  it("admits fresh status only when the head moved", () => {
    const nextHead = "3bf8e07dce32e59accf776357fb22278f57ba3f5";
    const verdict = routePostStatusProgress(
      baseInput({
        live_head_sha: nextHead,
        previous_status_head_sha: liveHead,
        requested_next_action: "fresh_status_readback",
        status_surfaces: [],
        embodiment_candidate: undefined,
      }),
    );

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "admit_fresh_status_readback");
    assert.equal(verdict.required_status_head_sha, nextHead);
  });

  it("admits fresh status when new checks appear on the same live head", () => {
    const verdict = routePostStatusProgress(
      baseInput({
        requested_next_action: "fresh_status_readback",
        embodiment_candidate: undefined,
        status_surfaces: [
          {
            surface_id: "new-live-head-check",
            branch: "monday-platform-genesis-01",
            head_sha: liveHead,
            conclusion: "pending",
            check_run_ids: ["route-governor-proof:27049651469", "route-governor-proof:27050000000"],
            evidence: ["new route governor proof run queued"],
          },
        ],
      }),
    );

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "admit_fresh_status_readback");
    assert.ok(verdict.decisive_evidence.includes("new live-head check route-governor-proof:27050000000"));
  });

  it("blocks duplicate status readback when neither the head nor checks changed", () => {
    const verdict = routePostStatusProgress(
      baseInput({ requested_next_action: "fresh_status_readback", embodiment_candidate: undefined }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_missing_status_delta");
  });

  it("emits exactly one external blocker only when blocker text exists", () => {
    const verdict = routePostStatusProgress(
      baseInput({
        requested_next_action: "exact_external_blocker",
        embodiment_candidate: undefined,
        exact_blocker: "live-head status API unavailable for the moved head",
      }),
    );

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "emit_exact_external_blocker");
    assert.deepEqual(verdict.blockers, ["live-head status API unavailable for the moved head"]);
  });
});
