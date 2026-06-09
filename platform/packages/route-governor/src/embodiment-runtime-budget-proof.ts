import assert from "node:assert/strict";

import {
  compileEmbodimentRuntimeBudget,
  type EmbodimentRuntimeBudgetInput,
} from "./embodiment-runtime-budget.js";

const branch = "monday-platform-genesis-01";
const head = "64e5e9606ee3457119096b37faadcc3982eec220";

function input(overrides: Partial<EmbodimentRuntimeBudgetInput> = {}): EmbodimentRuntimeBudgetInput {
  return {
    branch,
    active_branch: branch,
    head_sha: head,
    candidate_artifact_class: "runtime-budget-gate",
    spent_artifact_classes: ["status-surface-classifier", "current-head-repair-admission", "merge-readiness"],
    recent_artifact_kinds: ["status", "governor", "proof", "governor"],
    changed_files: ["platform/packages/route-governor/src/runtime-executor.ts"],
    runtime_artifacts: ["runtime execution surface admitted after guard saturation"],
    routing_artifacts: ["guard-only embodiment budget forces runtime/executor/adapter next"],
    proof_artifacts: ["dist/embodiment-runtime-budget-proof.js"],
    max_consecutive_governors: 3,
    ...overrides,
  };
}

const acceptedRuntime = compileEmbodimentRuntimeBudget(input());
assert.equal(acceptedRuntime.ok, true);
assert.equal(acceptedRuntime.action, "admit_runtime_embodiment");
assert.match(acceptedRuntime.next_route, /new head status surface/);

const saturatedGuard = compileEmbodimentRuntimeBudget(
  input({
    candidate_artifact_class: "another-guard-only-artifact",
    changed_files: ["platform/packages/route-governor/src/another-guard.ts"],
    runtime_artifacts: [],
    recent_artifact_kinds: ["status", "governor", "proof", "governor"],
  }),
);
assert.equal(saturatedGuard.ok, false);
assert.equal(saturatedGuard.action, "block_guard_saturation");
assert.deepEqual(saturatedGuard.blockers, [
  "next embodiment must introduce runtime, executor, or adapter behavior before another guard-only artifact",
]);

const underBudgetGuard = compileEmbodimentRuntimeBudget(
  input({
    candidate_artifact_class: "single-extra-governor",
    changed_files: ["platform/packages/route-governor/src/single-extra-governor.ts"],
    runtime_artifacts: [],
    recent_artifact_kinds: ["status"],
  }),
);
assert.equal(underBudgetGuard.ok, true);
assert.equal(underBudgetGuard.action, "allow_one_more_governor");

const spentClass = compileEmbodimentRuntimeBudget(
  input({
    candidate_artifact_class: "merge-readiness",
  }),
);
assert.equal(spentClass.ok, false);
assert.equal(spentClass.action, "block_spent_artifact_class");
assert.deepEqual(spentClass.blockers, ["artifact class already spent: merge-readiness"]);

const incompleteRuntime = compileEmbodimentRuntimeBudget(input({ runtime_artifacts: [], proof_artifacts: [] }));
assert.equal(incompleteRuntime.ok, false);
assert.equal(incompleteRuntime.action, "block_guard_saturation");
assert.deepEqual(incompleteRuntime.blockers, [
  "runtime embodiment requires a named runtime artifact",
  "runtime embodiment requires a proof artifact",
]);

const wrongBranch = compileEmbodimentRuntimeBudget(input({ branch: "main" }));
assert.equal(wrongBranch.ok, false);
assert.equal(wrongBranch.action, "block_guard_saturation");
assert.deepEqual(wrongBranch.blockers, ["candidate branch main does not match active branch monday-platform-genesis-01"]);

console.log("embodiment runtime budget proof passed");
