import assert from "node:assert/strict";

import {
  compileResolvedBoundaryEmbodimentPlan,
  type ResolvedBoundaryEmbodimentPlanInput,
} from "./resolved-boundary-embodiment-plan.js";

const branch = "monday-platform-genesis-01";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function input(overrides: Partial<ResolvedBoundaryEmbodimentPlanInput> = {}): ResolvedBoundaryEmbodimentPlanInput {
  return {
    active_branch: branch,
    live_head_sha: repairedHead,
    repaired_head_sha: repairedHead,
    status: {
      repaired_head_sha: repairedHead,
      verdict: "passing_with_warnings",
      successful_check_names: [
        "Monday Platform CI push",
        "Route Governor Proof push",
        "Monday Platform Route Governor push",
        "Monday Platform Route Governor pull_request",
        "Monday Platform CI pull_request",
        "Route Governor Proof pull_request",
        "PR Head Status Readback pull_request",
      ],
      successful_run_ids: [
        "27049650678",
        "27049650677",
        "27049650682",
        "27049651469",
        "27049651460",
        "27049651459",
        "27049651467",
      ],
      resolved_blocker_ids: ["issue-1-ci-status-readback"],
      non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
    },
    spent_artifact_classes: ["post_status_embodiment_queue", "warning_maintenance_router"],
    prohibited_move_classes: ["duplicate_ci_summary", "metadata_reread", "duplicate_comment", "duplicate_label"],
    candidate: {
      candidate_id: "resolved-boundary-embodiment-plan",
      move_class: "external_platform_embodiment",
      branch,
      base_head_sha: repairedHead,
      artifact_class: "resolved_boundary_embodiment_plan",
      changed_files: ["platform/packages/route-governor/src/resolved-boundary-embodiment-plan.ts"],
      executable_artifacts: ["compileResolvedBoundaryEmbodimentPlan"],
      routing_artifacts: ["resolved repaired-head boundary retires status replay and opens embodiment"],
      proof_artifacts: ["dist/resolved-boundary-embodiment-plan-proof.js"],
    },
    ...overrides,
  };
}

const admitted = compileResolvedBoundaryEmbodimentPlan(input());
assert.equal(admitted.ok, true);
assert.equal(admitted.action, "admit_resolved_boundary_embodiment");
assert.equal(admitted.next_status_expected_head, "post-write-head");
assert.deepEqual(admitted.blockers, []);
assert.ok(admitted.retired_evidence.some((item) => item.includes("27049651467")));

const duplicateSummary = compileResolvedBoundaryEmbodimentPlan(
  input({
    candidate: {
      ...input().candidate,
      move_class: "duplicate_ci_summary",
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
    },
  }),
);
assert.equal(duplicateSummary.ok, false);
assert.equal(duplicateSummary.action, "block_non_progress_move");

const guessedFutureCi = compileResolvedBoundaryEmbodimentPlan(
  input({
    candidate: {
      ...input().candidate,
      move_class: "guessed_future_ci",
    },
  }),
);
assert.equal(guessedFutureCi.ok, false);
assert.equal(guessedFutureCi.action, "block_non_progress_move");

const staleBase = compileResolvedBoundaryEmbodimentPlan(
  input({
    candidate: {
      ...input().candidate,
      base_head_sha: "15e9293960ed8af0fc9d02bd3a385141af1644c7",
    },
  }),
);
assert.equal(staleBase.ok, false);
assert.equal(staleBase.action, "block_stale_base_head");

console.log("resolved boundary embodiment plan proof passed");
