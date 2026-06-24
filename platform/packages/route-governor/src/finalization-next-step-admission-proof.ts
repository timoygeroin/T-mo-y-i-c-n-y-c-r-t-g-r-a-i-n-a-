import assert from "node:assert/strict";

import {
  admitFinalizationNextStep,
  type FinalizationNextStepAdmissionInput,
} from "./finalization-next-step-admission.js";

const branch = "monday-platform-genesis-01";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "fdae2e8acbd815decfa2862fd31136f6ab7852f9";

function input(overrides: Partial<FinalizationNextStepAdmissionInput> = {}): FinalizationNextStepAdmissionInput {
  return {
    active_branch: branch,
    target_branch: branch,
    prompt_head_sha: repairedHead,
    live_head_sha: liveHead,
    previous_status_head_sha: repairedHead,
    new_check_ids: [],
    candidate_class: "external_platform_embodiment",
    changed_files: ["platform/packages/route-governor/src/finalization-next-step-admission.ts"],
    executable_artifacts: ["admitFinalizationNextStep"],
    routing_artifacts: ["only embodiment, moved-head/new-check readback, or exact blocker can pass"],
    proof_artifacts: ["dist/finalization-next-step-admission-proof.js"],
    ...overrides,
  };
}

const embodiment = admitFinalizationNextStep(input());
assert.equal(embodiment.ok, true);
assert.equal(embodiment.action, "admit_external_platform_embodiment");
assert.match(embodiment.next_route, /resulting new head/);

const movedHeadReadback = admitFinalizationNextStep(input({ candidate_class: "fresh_status_readback" }));
assert.equal(movedHeadReadback.ok, true);
assert.equal(movedHeadReadback.action, "admit_fresh_status_readback");
assert.deepEqual(movedHeadReadback.blockers, []);

const newCheckReadback = admitFinalizationNextStep(
  input({
    candidate_class: "fresh_status_readback",
    prompt_head_sha: liveHead,
    previous_status_head_sha: liveHead,
    new_check_ids: ["workflow:27050000000"],
  }),
);
assert.equal(newCheckReadback.ok, true);
assert.equal(newCheckReadback.action, "admit_fresh_status_readback");

const staleReadback = admitFinalizationNextStep(
  input({
    candidate_class: "fresh_status_readback",
    prompt_head_sha: liveHead,
    previous_status_head_sha: liveHead,
  }),
);
assert.equal(staleReadback.ok, false);
assert.equal(staleReadback.action, "block_stale_status_readback");
assert.deepEqual(staleReadback.blockers, ["fresh status readback requires a moved PR head or newly surfaced checks"]);

for (const candidate_class of [
  "metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "guessed_future_ci",
  "reclose_completed_blocker",
  "old_repaired_head_blocker",
] as const) {
  const verdict = admitFinalizationNextStep(input({ candidate_class }));
  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_repeated_non_progress");
}

const exactBlocker = admitFinalizationNextStep(
  input({
    candidate_class: "exact_external_blocker",
    blocker_text: "GitHub contents API cannot write the active PR branch",
  }),
);
assert.equal(exactBlocker.ok, true);
assert.equal(exactBlocker.action, "admit_exact_external_blocker");

const missingBlocker = admitFinalizationNextStep(input({ candidate_class: "exact_external_blocker" }));
assert.equal(missingBlocker.ok, false);
assert.equal(missingBlocker.action, "block_incomplete_blocker");

const incompleteEmbodiment = admitFinalizationNextStep(input({ proof_artifacts: [] }));
assert.equal(incompleteEmbodiment.ok, false);
assert.equal(incompleteEmbodiment.action, "block_incomplete_embodiment");

const wrongBranch = admitFinalizationNextStep(input({ target_branch: "main" }));
assert.equal(wrongBranch.ok, false);
assert.equal(wrongBranch.action, "block_incomplete_embodiment");

console.log("finalization next-step admission proof passed");
