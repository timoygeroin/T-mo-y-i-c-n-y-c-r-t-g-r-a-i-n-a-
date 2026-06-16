import assert from "node:assert/strict";
import { test } from "node:test";

import {
  compileResolvedBoundaryEmbodimentPlan,
  type ResolvedBoundaryEmbodimentPlanInput,
} from "./resolved-boundary-embodiment-plan.js";

const branch = "monday-platform-genesis-01";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const nextHead = "post-boundary-next-head";

function input(overrides: Partial<ResolvedBoundaryEmbodimentPlanInput> = {}): ResolvedBoundaryEmbodimentPlanInput {
  return {
    active_branch: branch,
    live_head_sha: repairedHead,
    repaired_head_sha: repairedHead,
    status: {
      repaired_head_sha: repairedHead,
      verdict: "passing_with_warnings",
      successful_check_names: [
        "Monday Platform CI / Route governor proof surface",
        "Route Governor Proof / Route governor proof examples",
        "PR Head Status Readback / Read PR head status",
      ],
      successful_run_ids: ["27049651460", "27049651459", "27049651467"],
      resolved_blocker_ids: ["issue-1-ci-status-readback"],
      non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
    },
    spent_artifact_classes: ["post_status_embodiment_queue", "warning_maintenance_router"],
    prohibited_move_classes: ["duplicate_ci_summary", "metadata_reread", "duplicate_comment"],
    candidate: {
      candidate_id: "resolved-boundary-sequence-admission",
      move_class: "external_platform_embodiment",
      branch,
      base_head_sha: repairedHead,
      artifact_class: "resolved_boundary_embodiment_plan",
      changed_files: ["platform/packages/route-governor/src/resolved-boundary-embodiment-plan.ts"],
      executable_artifacts: ["compileResolvedBoundaryEmbodimentPlan"],
      routing_artifacts: ["resolved repaired-head boundary admits only new executable embodiment"],
      proof_artifacts: ["dist/resolved-boundary-embodiment-plan-proof.js"],
      result_head_sha: nextHead,
    },
    ...overrides,
  };
}

test("admits a behavior-bearing embodiment after repaired-head checks are resolved", () => {
  const verdict = compileResolvedBoundaryEmbodimentPlan(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_resolved_boundary_embodiment");
  assert.equal(verdict.base_head_sha, repairedHead);
  assert.equal(verdict.next_status_expected_head, nextHead);
  assert.deepEqual(verdict.blockers, []);
  assert.ok(verdict.retired_evidence.some((item) => item.includes(repairedHead)));
  assert.ok(verdict.decisive_evidence.includes("compileResolvedBoundaryEmbodimentPlan"));
});

test("blocks repeating repaired-head status summary classes", () => {
  const verdict = compileResolvedBoundaryEmbodimentPlan(
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

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_progress_move");
  assert.deepEqual(verdict.blockers, ["resolved-boundary move class is non-progress: duplicate_ci_summary"]);
});

test("blocks a candidate based on an older or guessed head", () => {
  const verdict = compileResolvedBoundaryEmbodimentPlan(
    input({
      candidate: {
        ...input().candidate,
        base_head_sha: "old-head",
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_base_head");
  assert.deepEqual(verdict.blockers, [`candidate base old-head is not live head ${repairedHead}`]);
});

test("blocks proof-only embodiment candidates", () => {
  const verdict = compileResolvedBoundaryEmbodimentPlan(
    input({
      candidate: {
        ...input().candidate,
        changed_files: ["platform/packages/route-governor/src/resolved-boundary-embodiment-plan.test.ts"],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_embodiment");
  assert.ok(verdict.blockers.includes("resolved-boundary embodiment is proof-only and changes no behavior file"));
});

test("blocks replaying an already spent artifact class", () => {
  const verdict = compileResolvedBoundaryEmbodimentPlan(
    input({
      spent_artifact_classes: ["resolved_boundary_embodiment_plan"],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_replayed_artifact_class");
  assert.deepEqual(verdict.blockers, ["artifact class already spent: resolved_boundary_embodiment_plan"]);
});

test("blocks unresolved repaired-head evidence", () => {
  const verdict = compileResolvedBoundaryEmbodimentPlan(
    input({
      status: {
        ...input().status,
        successful_run_ids: [],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_unresolved_boundary");
  assert.deepEqual(verdict.blockers, ["resolved boundary has no successful check/run evidence"]);
});
