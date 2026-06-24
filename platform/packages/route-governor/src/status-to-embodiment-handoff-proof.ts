import assert from "node:assert/strict";

import {
  compileStatusToEmbodimentHandoff,
  type StatusToEmbodimentHandoffInput,
} from "./status-to-embodiment-handoff.js";

const branch = "monday-platform-genesis-01";
const head = "b6c7c5cbce3e092531dc905bd38adb85b23a3275";

function input(overrides: Partial<StatusToEmbodimentHandoffInput> = {}): StatusToEmbodimentHandoffInput {
  return {
    branch,
    active_branch: branch,
    status_head_sha: head,
    live_head_sha: head,
    status_verdict: "passing_with_warnings",
    next_move_class: "external_platform_embodiment",
    changed_files: ["platform/packages/route-governor/src/status-to-embodiment-handoff.ts"],
    executable_artifacts: ["compileStatusToEmbodimentHandoff"],
    routing_artifacts: ["post-status passing readback must hand off to a new embodiment class"],
    proof_artifacts: ["dist/status-to-embodiment-handoff-proof.js"],
    artifact_class: "status-to-embodiment-handoff",
    spent_artifact_classes: ["status-surface-classifier", "post-embodiment-status-router"],
    ...overrides,
  };
}

const accepted = compileStatusToEmbodimentHandoff(input());
assert.equal(accepted.ok, true);
assert.equal(accepted.action, "accept_next_embodiment");
assert.match(accepted.next_route, /new-head status cursor/);

const staleStatus = compileStatusToEmbodimentHandoff(input({ status_head_sha: "old-head" }));
assert.equal(staleStatus.ok, false);
assert.equal(staleStatus.action, "block_head_mismatch");
assert.deepEqual(staleStatus.blockers, [`passing status belongs to old-head, not live head ${head}`]);

const statusReplay = compileStatusToEmbodimentHandoff(input({ next_move_class: "fresh_status_readback" }));
assert.equal(statusReplay.ok, false);
assert.equal(statusReplay.action, "block_status_replay");
assert.deepEqual(statusReplay.blockers, ["post-status move repeats non-progress class: fresh_status_readback"]);

const duplicateSummary = compileStatusToEmbodimentHandoff(input({ next_move_class: "duplicate_ci_summary" }));
assert.equal(duplicateSummary.ok, false);
assert.equal(duplicateSummary.action, "block_status_replay");

const missingProof = compileStatusToEmbodimentHandoff(input({ proof_artifacts: [] }));
assert.equal(missingProof.ok, false);
assert.equal(missingProof.action, "block_incomplete_embodiment");
assert.deepEqual(missingProof.blockers, ["post-status embodiment has no proof artifact evidence"]);

const spentClass = compileStatusToEmbodimentHandoff(
  input({ spent_artifact_classes: ["status-to-embodiment-handoff"] }),
);
assert.equal(spentClass.ok, false);
assert.equal(spentClass.action, "block_incomplete_embodiment");
assert.deepEqual(spentClass.blockers, ["post-status embodiment repeats spent artifact class: status-to-embodiment-handoff"]);

const wrongBranch = compileStatusToEmbodimentHandoff(input({ branch: "main" }));
assert.equal(wrongBranch.ok, false);
assert.equal(wrongBranch.action, "block_head_mismatch");

console.log("status-to-embodiment handoff proof passed");
