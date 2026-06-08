import assert from "node:assert/strict";

import { compileProofFailureRepairPlan, type ProofFailureRepairPlanInput } from "./proof-failure-repair-plan.js";

const branch = "monday-platform-genesis-01";
const liveHead = "017a6ecd3b6c999be83cca755fc71c4e229619fc";
const repairPath = "platform/packages/route-governor/src/proof-failure-repair-plan.ts";

function input(overrides: Partial<ProofFailureRepairPlanInput> = {}): ProofFailureRepairPlanInput {
  return {
    branch,
    active_branch: branch,
    live_head_sha: liveHead,
    public_summary: {
      surface_id: "public-checks-df3a4035-route-governor-proof-surface",
      head_sha: liveHead,
      check_name: "Monday Platform CI / Route governor proof surface",
      failed_step: "Run proof examples",
      exit_code: 1,
      annotation_count: 1,
    },
    candidate: {
      candidate_id: "repair-bound-proof-example-failure",
      repair_class: "head_bound_proof_failure_repair",
      head_sha: liveHead,
      changed_files: [repairPath],
      executable_artifacts: ["compileProofFailureRepairPlan"],
      routing_artifacts: ["head-bound proof repair plan"],
      cited_failure: {
        surface_id: "actions-log-27100000001",
        head_sha: liveHead,
        check_name: "Monday Platform CI / Route governor proof surface",
        failed_step: "Run proof examples",
        exit_code: 1,
        assertion: "expected proof-chain readiness to include the new proof-failure repair plan artifact",
      },
    },
    spent_repair_classes: [],
    expected_repair_paths: [repairPath],
    ...overrides,
  };
}

const repair = compileProofFailureRepairPlan(input());
assert.equal(repair.ok, true);
assert.equal(repair.action, "repair_with_bound_failure");
assert.ok(repair.decisive_evidence.includes("compileProofFailureRepairPlan"));
assert.ok(repair.next_route.includes("moved-head status readback"));

const summaryOnly = compileProofFailureRepairPlan(input({ candidate: undefined }));
assert.equal(summaryOnly.ok, false);
assert.equal(summaryOnly.action, "obtain_failure_log");
assert.ok(summaryOnly.blockers[0].includes("no head-bound repair candidate"));

const blindRepair = compileProofFailureRepairPlan(
  input({
    candidate: {
      ...input().candidate!,
      cited_failure: {
        surface_id: "public-checks-summary-only",
        head_sha: liveHead,
        check_name: "Monday Platform CI / Route governor proof surface",
        failed_step: "Run proof examples",
        exit_code: 1,
      },
    },
  }),
);
assert.equal(blindRepair.ok, false);
assert.equal(blindRepair.action, "obtain_failure_log");
assert.ok(blindRepair.blockers[0].includes("without an actionable assertion or log excerpt"));

const staleSummary = compileProofFailureRepairPlan(
  input({
    public_summary: {
      ...input().public_summary,
      head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
    },
  }),
);
assert.equal(staleSummary.ok, false);
assert.equal(staleSummary.action, "block_stale_repair");
assert.ok(staleSummary.blockers[0].includes("not live head"));

const spentRepair = compileProofFailureRepairPlan(input({ spent_repair_classes: ["head_bound_proof_failure_repair"] }));
assert.equal(spentRepair.ok, false);
assert.equal(spentRepair.action, "block_blind_repair");
assert.ok(spentRepair.blockers[0].includes("already spent"));

const wrongPath = compileProofFailureRepairPlan(
  input({
    candidate: {
      ...input().candidate!,
      changed_files: ["platform/packages/route-governor/src/unrelated.ts"],
    },
  }),
);
assert.equal(wrongPath.ok, false);
assert.equal(wrongPath.action, "block_blind_repair");
assert.ok(wrongPath.blockers.some((blocker) => blocker.includes("expected repair path")));

console.log("proof-failure-repair-plan proof passed");
