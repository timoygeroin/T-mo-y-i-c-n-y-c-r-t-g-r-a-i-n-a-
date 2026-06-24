import assert from "node:assert/strict";

import { admitScheduledRunProgress, type ScheduledRunAdmissionInput } from "./scheduled-run-admission.js";

const liveHead = "cbfe1699117a33106bb3237ab111495c4d4bde2f";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function input(overrides: Partial<ScheduledRunAdmissionInput> = {}): ScheduledRunAdmissionInput {
  return {
    invocation_kind: "scheduled",
    active_branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    instruction_head_sha: repairedHead,
    last_repaired_head_sha: repairedHead,
    repaired_head_status_resolved: true,
    spent_artifact_classes: [],
    prohibited_move_classes: ["duplicate_ci_summary", "metadata_reread", "duplicate_comment", "internal_memory_guard"],
    candidate: {
      candidate_id: "scheduled-run-admission-gate",
      move_class: "external_platform_embodiment",
      artifact_class: "scheduled_run_admission_gate",
      base_head_sha: liveHead,
      changed_files: ["platform/packages/route-governor/src/scheduled-run-admission.ts"],
      executable_artifacts: ["admitScheduledRunProgress"],
      routing_artifacts: ["scheduled run cannot count stale prompt-head assumptions or duplicate summaries as progress"],
      proof_artifacts: ["dist/scheduled-run-admission-proof.js"],
      status_surface_ids: [],
    },
    ...overrides,
  };
}

const admitted = admitScheduledRunProgress(input());
assert.equal(admitted.ok, true);
assert.equal(admitted.action, "admit_scheduled_embodiment");
assert.equal(admitted.historical_repaired_head_sha, repairedHead);

const stale = admitScheduledRunProgress(
  input({
    candidate: {
      ...input().candidate,
      base_head_sha: repairedHead,
    },
  }),
);
assert.equal(stale.ok, false);
assert.equal(stale.action, "block_stale_scheduled_base");

const duplicate = admitScheduledRunProgress(
  input({
    candidate: {
      ...input().candidate,
      move_class: "duplicate_ci_summary",
    },
  }),
);
assert.equal(duplicate.ok, false);
assert.equal(duplicate.action, "block_scheduled_non_progress");

const statusReadback = admitScheduledRunProgress(
  input({
    candidate: {
      ...input().candidate,
      candidate_id: "moved-head-status-readback",
      move_class: "fresh_status_readback",
      artifact_class: "moved_head_status_readback",
      status_surface_ids: [],
    },
  }),
);
assert.equal(statusReadback.ok, true);
assert.equal(statusReadback.action, "admit_moved_head_status_readback");

const replayedArtifact = admitScheduledRunProgress(
  input({
    spent_artifact_classes: ["scheduled_run_admission_gate"],
  }),
);
assert.equal(replayedArtifact.ok, false);
assert.equal(replayedArtifact.action, "block_replayed_scheduled_artifact");

console.log("scheduled run admission proof passed");
