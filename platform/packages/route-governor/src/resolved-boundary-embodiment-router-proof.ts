import { routeResolvedBoundaryEmbodiment, type ResolvedBoundaryEmbodimentInput } from "./resolved-boundary-embodiment-router.js";

function proofInput(overrides: Partial<ResolvedBoundaryEmbodimentInput> = {}): ResolvedBoundaryEmbodimentInput {
  const live = "7323b32af4a29c182945b42f36e34b771a7d5870";
  return {
    active_branch: "monday-platform-genesis-01",
    evidence: {
      repaired_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
      live_head_sha: live,
      status_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
      status_verdict: "passing_with_warnings",
      successful_check_run_ids: ["27049650678", "27049650677", "27049650682", "27049651469", "27049651460", "27049651459", "27049651467"],
      resolved_blocker_ids: ["issue-1-ci-status-readback"],
      blocker_label_removed: true,
      pr_ready_for_review: true,
      non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
    },
    prohibited_move_classes: ["duplicate_ci_summary", "duplicate_comment", "duplicate_label", "local_memory_guard", "metadata_reread", "reclose_resolved_blocker"],
    spent_candidate_ids: ["post-repair-embodiment-admission", "warning-maintenance-router"],
    candidate: {
      candidate_id: "resolved-boundary-embodiment-router",
      move_class: "external_platform_embodiment",
      branch: "monday-platform-genesis-01",
      base_head_sha: live,
      changed_files: ["platform/packages/route-governor/src/resolved-boundary-embodiment-router.ts"],
      executable_artifacts: ["routeResolvedBoundaryEmbodiment"],
      routing_artifacts: ["resolved boundary to live-head embodiment router"],
      proof_artifacts: ["platform/packages/route-governor/src/resolved-boundary-embodiment-router-proof.ts"],
    },
    ...overrides,
  };
}

const admitted = routeResolvedBoundaryEmbodiment(proofInput());
if (!admitted.ok || admitted.action !== "admit_resolved_boundary_embodiment") {
  throw new Error(`resolved boundary embodiment should be admitted: ${admitted.blockers.join("; ")}`);
}

const duplicate = routeResolvedBoundaryEmbodiment(proofInput({ candidate: { ...proofInput().candidate, move_class: "duplicate_ci_summary", changed_files: [], executable_artifacts: [], routing_artifacts: [], proof_artifacts: [] } }));
if (duplicate.ok || duplicate.action !== "block_non_progress_move") {
  throw new Error("duplicate CI summary should be blocked after boundary resolution");
}

const warningRepair = routeResolvedBoundaryEmbodiment(proofInput({ candidate: { ...proofInput().candidate, move_class: "warning_maintenance" } }));
if (warningRepair.ok || !warningRepair.blockers.some((blocker) => blocker.includes("non-blocking warning"))) {
  throw new Error("Node 20 warning should remain below embodiment");
}
