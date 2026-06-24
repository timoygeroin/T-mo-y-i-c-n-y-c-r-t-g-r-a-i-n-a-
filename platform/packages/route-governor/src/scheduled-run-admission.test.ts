import assert from "node:assert/strict";
import { test } from "node:test";

import { admitScheduledRunProgress, type ScheduledRunAdmissionInput } from "./scheduled-run-admission.js";

const liveHead = "cbfe1699117a33106bb3237ab111495c4d4bde2f";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const repairedHeadBlocker = "repaired-head status readback for b38ea247602ae8ebba80c4120ad03b41b26bd841 is unresolved";

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
    prohibited_blockers: [repairedHeadBlocker],
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

test("admits a scheduled executable embodiment bound to the live head", () => {
  const verdict = admitScheduledRunProgress(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_scheduled_embodiment");
  assert.equal(verdict.head_sha, liveHead);
  assert.equal(verdict.historical_repaired_head_sha, repairedHead);
});

test("blocks scheduled candidates based on the repaired historical head", () => {
  const verdict = admitScheduledRunProgress(
    input({
      candidate: {
        ...input().candidate,
        base_head_sha: repairedHead,
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_scheduled_base");
});

test("blocks duplicate summaries and metadata rereads as scheduled progress", () => {
  const verdict = admitScheduledRunProgress(
    input({
      candidate: {
        ...input().candidate,
        move_class: "metadata_reread",
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_scheduled_non_progress");
});

test("admits moved-head status readback only as the readback class", () => {
  const verdict = admitScheduledRunProgress(
    input({
      candidate: {
        ...input().candidate,
        candidate_id: "moved-head-status-readback",
        move_class: "fresh_status_readback",
        artifact_class: "moved_head_status_readback",
      },
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_moved_head_status_readback");
});

test("blocks spent artifact classes in scheduled embodiment mode", () => {
  const verdict = admitScheduledRunProgress(
    input({
      spent_artifact_classes: ["scheduled_run_admission_gate"],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_replayed_scheduled_artifact");
});

test("blocks prohibited repaired-head blockers even under exact blocker mode", () => {
  const verdict = admitScheduledRunProgress(
    input({
      candidate: {
        ...input().candidate,
        candidate_id: "old-repaired-head-blocker",
        move_class: "exact_external_blocker",
        artifact_class: "prohibited_repaired_head_blocker",
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
        blocker: repairedHeadBlocker,
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_scheduled_non_progress");
  assert.deepEqual(verdict.blockers, [`scheduled run cannot emit prohibited blocker: ${repairedHeadBlocker}`]);
});
