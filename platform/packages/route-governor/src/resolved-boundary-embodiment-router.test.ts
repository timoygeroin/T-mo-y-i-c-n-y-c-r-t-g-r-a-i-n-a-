import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { routeResolvedBoundaryEmbodiment, type ResolvedBoundaryEmbodimentInput } from "./resolved-boundary-embodiment-router.js";

function input(overrides: Partial<ResolvedBoundaryEmbodimentInput> = {}): ResolvedBoundaryEmbodimentInput {
  const live = "7323b32af4a29c182945b42f36e34b771a7d5870";
  return {
    active_branch: "monday-platform-genesis-01",
    evidence: {
      repaired_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
      live_head_sha: live,
      status_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
      status_verdict: "passing_with_warnings",
      successful_check_run_ids: ["27049650678", "27049651467"],
      resolved_blocker_ids: ["issue-1-ci-status-readback"],
      blocker_label_removed: true,
      pr_ready_for_review: true,
      non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
    },
    prohibited_move_classes: ["duplicate_ci_summary", "metadata_reread", "reclose_resolved_blocker"],
    spent_candidate_ids: ["post-repair-embodiment-admission"],
    candidate: {
      candidate_id: "resolved-boundary-embodiment-router",
      move_class: "external_platform_embodiment",
      branch: "monday-platform-genesis-01",
      base_head_sha: live,
      changed_files: ["platform/packages/route-governor/src/resolved-boundary-embodiment-router.ts"],
      executable_artifacts: ["routeResolvedBoundaryEmbodiment"],
      routing_artifacts: ["resolved boundary to next embodiment router"],
      proof_artifacts: ["platform/packages/route-governor/src/resolved-boundary-embodiment-router.test.ts"],
    },
    ...overrides,
  };
}

describe("routeResolvedBoundaryEmbodiment", () => {
  it("admits a live-head embodiment after the repaired boundary is resolved", () => {
    const verdict = routeResolvedBoundaryEmbodiment(input());
    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "admit_resolved_boundary_embodiment");
    assert.deepEqual(verdict.blockers, []);
    assert.ok(verdict.quarantined_head_shas.includes("b38ea247602ae8ebba80c4120ad03b41b26bd841"));
    assert.ok(verdict.decisive_evidence.includes("success:27049650678"));
  });

  it("blocks duplicate summaries after the boundary has already resolved", () => {
    const verdict = routeResolvedBoundaryEmbodiment(input({ candidate: { ...input().candidate, move_class: "duplicate_ci_summary", changed_files: [], executable_artifacts: [], routing_artifacts: [], proof_artifacts: [] } }));
    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_non_progress_move");
    assert.match(verdict.blockers.join("; "), /duplicate_ci_summary/);
  });

  it("blocks another repaired-head readback when no live-head checks are new", () => {
    const verdict = routeResolvedBoundaryEmbodiment(input({ candidate: { ...input().candidate, move_class: "fresh_status_readback", changed_files: [], executable_artifacts: [], routing_artifacts: [], proof_artifacts: [] } }));
    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_stale_repaired_head_replay");
  });

  it("keeps the Node 20 warning below embodiment instead of treating it as a repair", () => {
    const verdict = routeResolvedBoundaryEmbodiment(input({ candidate: { ...input().candidate, move_class: "warning_maintenance" } }));
    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_non_progress_move");
    assert.match(verdict.blockers.join("; "), /non-blocking warning remains below embodiment/);
  });

  it("blocks unresolved repaired-head evidence", () => {
    const verdict = routeResolvedBoundaryEmbodiment(input({ evidence: { ...input().evidence, blocker_label_removed: false, pr_ready_for_review: false } }));
    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_boundary_unresolved");
    assert.match(verdict.blockers.join("; "), /blocker label/);
  });
});
