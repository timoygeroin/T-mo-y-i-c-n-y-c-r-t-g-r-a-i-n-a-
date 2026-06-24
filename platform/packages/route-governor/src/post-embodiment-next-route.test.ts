import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  routeAfterEmbodimentCommit,
  type PostEmbodimentNextRouteInput,
} from "./post-embodiment-next-route.js";

const BRANCH = "monday-platform-genesis-01";
const PREVIOUS_HEAD = "9ac69c2cdcd63405acdbb0ed8e7575708c467655";
const COMMITTED_HEAD = "42fe02728ef763104f322d2526e4997800ef6c4a";
const REPAIRED_HEAD = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function scenario(overrides: Partial<PostEmbodimentNextRouteInput> = {}): PostEmbodimentNextRouteInput {
  return {
    active_branch: BRANCH,
    previous_head_sha: PREVIOUS_HEAD,
    committed_head_sha: COMMITTED_HEAD,
    last_status_readback_head_sha: REPAIRED_HEAD,
    status_surfaces: [
      {
        surface_id: "repaired-head-success-summary",
        head_sha: REPAIRED_HEAD,
        verdict: "passing_with_warnings",
        evidence: ["historical repaired-head checks succeeded"],
      },
    ],
    candidate: {
      candidate_class: "fresh_status_readback",
      branch: BRANCH,
      base_head_sha: COMMITTED_HEAD,
    },
    ...overrides,
  };
}

describe("routeAfterEmbodimentCommit", () => {
  it("requires status readback for the committed head and marks old status stale", () => {
    const verdict = routeAfterEmbodimentCommit(scenario());

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "require_new_head_status_readback");
    assert.deepEqual(verdict.accepted_status_surfaces, []);
    assert.deepEqual(verdict.stale_status_surfaces, ["repaired-head-success-summary"]);
  });

  it("blocks merge, review, and another embodiment until committed-head status is read", () => {
    for (const candidate_class of ["merge_attempt", "review_request", "external_platform_embodiment"] as const) {
      const verdict = routeAfterEmbodimentCommit(
        scenario({
          candidate: {
            candidate_class,
            branch: BRANCH,
            base_head_sha: COMMITTED_HEAD,
          },
        }),
      );

      assert.equal(verdict.ok, false);
      assert.equal(verdict.action, "block_status_gated_progress");
      assert.match(verdict.blockers[0], /until status is read/);
    }
  });

  it("accepts direct status surfaces only when they belong to the committed head", () => {
    const verdict = routeAfterEmbodimentCommit(
      scenario({
        status_surfaces: [
          {
            surface_id: "committed-head-route-governor-proof",
            head_sha: COMMITTED_HEAD,
            verdict: "passing_with_warnings",
            evidence: ["Route Governor Proof completed for committed head"],
          },
          {
            surface_id: "older-repaired-head-status",
            head_sha: REPAIRED_HEAD,
            verdict: "passing_with_warnings",
            evidence: ["older repaired-head status"],
          },
        ],
      }),
    );

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "admit_head_bound_status_surface");
    assert.deepEqual(verdict.accepted_status_surfaces, ["committed-head-route-governor-proof"]);
    assert.deepEqual(verdict.stale_status_surfaces, ["older-repaired-head-status"]);
  });

  it("rejects non-progress repeats and stale candidate bases", () => {
    const repeated = routeAfterEmbodimentCommit(
      scenario({
        candidate: {
          candidate_class: "local_memory_guard",
          branch: BRANCH,
          base_head_sha: COMMITTED_HEAD,
        },
      }),
    );
    assert.equal(repeated.ok, false);
    assert.equal(repeated.action, "block_repeated_non_progress");

    const stale = routeAfterEmbodimentCommit(
      scenario({
        candidate: {
          candidate_class: "fresh_status_readback",
          branch: BRANCH,
          base_head_sha: PREVIOUS_HEAD,
        },
      }),
    );
    assert.equal(stale.ok, false);
    assert.equal(stale.action, "block_stale_candidate_base");
  });

  it("allows one exact blocker only when it names the committed head", () => {
    const missingHead = routeAfterEmbodimentCommit(
      scenario({
        candidate: {
          candidate_class: "exact_external_blocker",
          branch: BRANCH,
          base_head_sha: COMMITTED_HEAD,
          blocker: "COMMITTED_HEAD_STATUS_SURFACE_UNAVAILABLE",
        },
      }),
    );
    assert.equal(missingHead.ok, false);
    assert.equal(missingHead.action, "block_missing_exact_blocker");

    const bound = routeAfterEmbodimentCommit(
      scenario({
        candidate: {
          candidate_class: "exact_external_blocker",
          branch: BRANCH,
          base_head_sha: COMMITTED_HEAD,
          blocker: `COMMITTED_HEAD_STATUS_SURFACE_UNAVAILABLE: ${COMMITTED_HEAD}`,
        },
      }),
    );
    assert.equal(bound.ok, true);
    assert.equal(bound.action, "emit_exact_external_blocker");
  });
});
