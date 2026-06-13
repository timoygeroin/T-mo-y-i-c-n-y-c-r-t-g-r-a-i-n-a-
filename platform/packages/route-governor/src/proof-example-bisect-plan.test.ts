import test from "node:test";
import assert from "node:assert/strict";

import {
  compileProofExampleBisectPlan,
  type ProofExampleBisectInput,
  type ProofExampleFailureSurface,
  type ProofExampleProbeModule,
} from "./proof-example-bisect-plan.js";

const branch = "monday-platform-genesis-01";
const liveHead = "7b03f6243860e1c85e650ea07248559092de4ddf";

const probes: ProofExampleProbeModule[] = [
  {
    module_id: "current-head-failure-intake",
    dist_path: "dist/current-head-failure-intake-proof.js",
    source_path: "platform/packages/route-governor/src/current-head-failure-intake.ts",
  },
  {
    module_id: "review-handoff-readiness",
    dist_path: "dist/review-handoff-readiness-proof.js",
    source_path: "platform/packages/route-governor/src/review-handoff-readiness.ts",
  },
  {
    module_id: "proof-chain",
    dist_path: "dist/proof-chain-proof.js",
    source_path: "platform/packages/route-governor/src/proof-chain.ts",
  },
];

function surface(overrides: Partial<ProofExampleFailureSurface> = {}): ProofExampleFailureSurface {
  return {
    surface_id: "checks:7b03-proof-examples",
    branch,
    head_sha: liveHead,
    check_name: "Monday Platform CI / Route governor proof surface",
    failed_step: "Run proof examples",
    exit_code: 1,
    ...overrides,
  };
}

function proofCommand(): string {
  return [
    "tsc -p tsconfig.json",
    "node dist/current-head-failure-intake-proof.js",
    "node dist/review-handoff-readiness-proof.js",
    "node dist/proof-chain-proof.js",
  ].join(" && ");
}

function input(overrides: Partial<ProofExampleBisectInput> = {}): ProofExampleBisectInput {
  return {
    active_branch: branch,
    live_head_sha: liveHead,
    proof_script_command: proofCommand(),
    status_verdict: "failing",
    failure_surface: surface(),
    probe_modules: probes,
    spent_probe_modules: ["current-head-failure-intake"],
    ...overrides,
  };
}

test("emits head-bound isolated proof-module probe commands for generic proof example failures", () => {
  const plan = compileProofExampleBisectPlan(input());

  assert.equal(plan.ok, true);
  assert.equal(plan.action, "emit_bisect_plan");
  assert.deepEqual(
    plan.commands.map((command) => command.module_id),
    ["review-handoff-readiness", "proof-chain"],
  );
  assert.equal(plan.commands[0]?.source_path, "platform/packages/route-governor/src/review-handoff-readiness.ts");
  assert.equal(plan.commands[0]?.command, "node dist/review-handoff-readiness-proof.js");
  assert.equal(
    plan.commands[0]?.head_bound_command,
    `MONDAY_ACTIVE_BRANCH='${branch}' MONDAY_LIVE_HEAD_SHA='${liveHead}' node dist/review-handoff-readiness-proof.js`,
  );
  assert.match(plan.next_route, /head-bound isolated proof-module commands/);
});

test("routes directly to repair when the exact failing proof module is known", () => {
  const exact = compileProofExampleBisectPlan(
    input({ failure_surface: surface({ exact_proof_module: "review-handoff-readiness-proof" }) }),
  );

  assert.equal(exact.ok, true);
  assert.equal(exact.action, "repair_from_exact_proof_module");
  assert.equal(exact.commands.length, 0);
});

test("blocks missing live head before probe emission", () => {
  const missingHead = compileProofExampleBisectPlan(input({ live_head_sha: "" }));

  assert.equal(missingHead.ok, false);
  assert.equal(missingHead.action, "block_missing_live_head");
  assert.deepEqual(missingHead.commands, []);
});

test("blocks stale, wrong-branch, non-failing, and exhausted probe surfaces", () => {
  assert.equal(
    compileProofExampleBisectPlan(
      input({ failure_surface: surface({ head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }) }),
    ).action,
    "block_stale_failure_surface",
  );

  assert.equal(compileProofExampleBisectPlan(input({ failure_surface: surface({ branch: "main" }) })).action, "block_branch_mismatch");
  assert.equal(compileProofExampleBisectPlan(input({ status_verdict: "passing_with_warnings" })).action, "block_non_failing_surface");
  assert.equal(compileProofExampleBisectPlan(input({ proof_script_command: "" })).action, "block_missing_proof_command");
  assert.equal(
    compileProofExampleBisectPlan(input({ spent_probe_modules: probes.map((probe) => probe.module_id) })).action,
    "block_no_probe_modules",
  );
});
