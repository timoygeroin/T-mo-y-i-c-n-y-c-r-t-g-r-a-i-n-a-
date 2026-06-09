import assert from "node:assert/strict";

import {
  compileScheduledLiveHeadAdmission,
  type ScheduledLiveHeadAdmissionInput,
} from "./scheduled-live-head-admission.js";

const branch = "monday-platform-genesis-01";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "6117aeaf48fd8f18185bcadbcb94419bbe5b95dc";

function input(overrides: Partial<ScheduledLiveHeadAdmissionInput> = {}): ScheduledLiveHeadAdmissionInput {
  return {
    active_branch: branch,
    candidate_branch: branch,
    live_head_sha: liveHead,
    prompt_carried_head_sha: repairedHead,
    resolved_repaired_head_sha: repairedHead,
    current_head_check_run_ids: [],
    candidate: {
      candidate_id: "scheduled-live-head-embodiment",
      move_class: "external_platform_embodiment",
      changed_files: ["platform/packages/route-governor/src/scheduled-live-head-admission.ts"],
      executable_artifacts: ["compileScheduledLiveHeadAdmission"],
      routing_artifacts: ["scheduled finalization live-head admission"],
      proof_artifacts: ["dist/scheduled-live-head-admission-proof.js"],
    },
    ...overrides,
  };
}

const embodiment = compileScheduledLiveHeadAdmission(input());
assert.equal(embodiment.ok, true);
assert.equal(embodiment.action, "admit_external_embodiment");
assert.match(embodiment.next_route, /resulting new head/);

const oldBlocker = compileScheduledLiveHeadAdmission(
  input({
    candidate: {
      ...input().candidate,
      move_class: "old_repaired_head_blocker",
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      proof_artifacts: [],
    },
  }),
);
assert.equal(oldBlocker.ok, false);
assert.equal(oldBlocker.action, "block_stale_repaired_head");
assert.deepEqual(oldBlocker.blockers, [`prompt-carried repaired head ${repairedHead} is not the live PR head`]);

const freshMovedHeadReadback = compileScheduledLiveHeadAdmission(
  input({
    candidate: {
      ...input().candidate,
      move_class: "fresh_status_readback",
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      proof_artifacts: [],
    },
  }),
);
assert.equal(freshMovedHeadReadback.ok, true);
assert.equal(freshMovedHeadReadback.action, "admit_fresh_status_readback");

const duplicateSummary = compileScheduledLiveHeadAdmission(
  input({
    candidate: {
      ...input().candidate,
      move_class: "duplicate_ci_summary",
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      proof_artifacts: [],
    },
  }),
);
assert.equal(duplicateSummary.ok, false);
assert.equal(duplicateSummary.action, "block_non_progress");

const missingBlocker = compileScheduledLiveHeadAdmission(
  input({
    candidate: {
      ...input().candidate,
      move_class: "exact_external_blocker",
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      proof_artifacts: [],
      exact_blocker: "",
    },
  }),
);
assert.equal(missingBlocker.ok, false);
assert.deepEqual(missingBlocker.blockers, ["exact blocker move has no blocker text"]);

const exactBlocker = compileScheduledLiveHeadAdmission(
  input({
    candidate: {
      ...input().candidate,
      move_class: "exact_external_blocker",
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      proof_artifacts: [],
      exact_blocker: "current-head Actions log surface is unavailable to this runtime",
    },
  }),
);
assert.equal(exactBlocker.ok, true);
assert.equal(exactBlocker.action, "admit_exact_blocker");

const wrongBranch = compileScheduledLiveHeadAdmission(input({ candidate_branch: "main" }));
assert.equal(wrongBranch.ok, false);
assert.equal(wrongBranch.action, "block_non_progress");

console.log("scheduled live-head admission proof passed");
