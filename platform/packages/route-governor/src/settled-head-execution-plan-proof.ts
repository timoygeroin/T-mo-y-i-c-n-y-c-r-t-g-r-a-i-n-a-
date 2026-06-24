import {
  compileSettledHeadExecutionPlan,
  type SettledHeadExecutionPlanInput,
} from "./settled-head-execution-plan.js";

const BRANCH = "monday-platform-genesis-01";
const SETTLED_REPAIRED_HEAD = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const LIVE_HEAD = "06c0e4a99b0ba6299bf177cc1f5dd18dcc0187d6";

function scenario(overrides: Partial<SettledHeadExecutionPlanInput> = {}): SettledHeadExecutionPlanInput {
  return {
    active_branch: BRANCH,
    live_head_sha: LIVE_HEAD,
    settled_repaired_head_sha: SETTLED_REPAIRED_HEAD,
    last_status_readback_head_sha: SETTLED_REPAIRED_HEAD,
    repaired_boundary_resolved: true,
    live_status_verdict: "passing_with_warnings",
    non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
    candidate: {
      candidate_id: "settled-head-execution-plan",
      move_class: "behavior_execution_plan",
      branch: BRANCH,
      base_head_sha: LIVE_HEAD,
      changed_files: [
        "platform/packages/route-governor/src/settled-head-execution-plan.ts",
        "platform/packages/route-governor/src/settled-head-execution-plan-proof.ts",
      ],
      executable_artifacts: ["compileSettledHeadExecutionPlan"],
      routing_artifacts: ["settled repaired-head to behavior execution plan router"],
      proof_artifacts: ["settled-head-execution-plan-proof"],
      new_check_runs: [],
    },
    ...overrides,
  };
}

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runSettledHeadExecutionPlanProof(): void {
  const admitted = compileSettledHeadExecutionPlan(scenario());
  expect(admitted.ok, `settled-head execution plan should be admitted: ${admitted.blockers.join("; ")}`);
  expect(admitted.action === "compile_settled_head_execution_plan", `unexpected action ${admitted.action}`);
  expect(admitted.retired_head_shas.includes(SETTLED_REPAIRED_HEAD), "settled repaired head must be retired");
  expect(
    admitted.warning_receipts.includes("Node.js 20 Actions deprecation notice"),
    "non-blocking warning must be preserved without becoming progress",
  );
  expect(
    admitted.execution_order.includes("move the PR branch head"),
    "execution plan must include branch-head movement",
  );

  const duplicateWarning = compileSettledHeadExecutionPlan(
    scenario({
      candidate: {
        candidate_id: "warning-maintenance",
        move_class: "warning_maintenance",
        branch: BRANCH,
        base_head_sha: LIVE_HEAD,
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
        new_check_runs: [],
      },
    }),
  );
  expect(!duplicateWarning.ok, "warning-only maintenance must not count as settled-head progress");
  expect(duplicateWarning.action === "block_non_progress_class", `unexpected warning action ${duplicateWarning.action}`);

  const replayedReadback = compileSettledHeadExecutionPlan(
    scenario({
      live_head_sha: SETTLED_REPAIRED_HEAD,
      last_status_readback_head_sha: SETTLED_REPAIRED_HEAD,
      candidate: {
        candidate_id: "duplicate-repaired-head-readback",
        move_class: "fresh_status_readback",
        branch: BRANCH,
        base_head_sha: SETTLED_REPAIRED_HEAD,
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
        new_check_runs: [],
      },
    }),
  );
  expect(!replayedReadback.ok, "repaired-head status readback must not replay");
  expect(replayedReadback.action === "block_repaired_head_replay", `unexpected replay action ${replayedReadback.action}`);

  const proofOnly = compileSettledHeadExecutionPlan(
    scenario({
      candidate: {
        candidate_id: "proof-only",
        move_class: "behavior_execution_plan",
        branch: BRANCH,
        base_head_sha: LIVE_HEAD,
        changed_files: ["platform/packages/route-governor/src/settled-head-execution-plan-proof.ts"],
        executable_artifacts: ["compileSettledHeadExecutionPlan"],
        routing_artifacts: ["settled repaired-head to behavior execution plan router"],
        proof_artifacts: ["settled-head-execution-plan-proof"],
        new_check_runs: [],
      },
    }),
  );
  expect(!proofOnly.ok, "proof-only execution plan must not be admitted as behavior progress");
  expect(proofOnly.action === "block_incomplete_execution_plan", `unexpected proof-only action ${proofOnly.action}`);

  const unsettledBoundary = compileSettledHeadExecutionPlan(scenario({ repaired_boundary_resolved: false }));
  expect(!unsettledBoundary.ok, "unsettled repaired-head boundary must block execution planning");
  expect(
    unsettledBoundary.action === "block_unsettled_repair_boundary",
    `unexpected unsettled action ${unsettledBoundary.action}`,
  );

  const exactBlocker = compileSettledHeadExecutionPlan(
    scenario({
      candidate: {
        candidate_id: "exact-blocker",
        move_class: "exact_external_blocker",
        branch: BRANCH,
        base_head_sha: LIVE_HEAD,
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
        new_check_runs: [],
        blocker: "GitHub contents API refused branch mutation for the live head",
      },
    }),
  );
  expect(exactBlocker.ok, `exact blocker should be emitted: ${exactBlocker.blockers.join("; ")}`);
  expect(exactBlocker.action === "emit_exact_external_blocker", `unexpected blocker action ${exactBlocker.action}`);
}

runSettledHeadExecutionPlanProof();
