import assert from "node:assert/strict";
import { test } from "node:test";

import {
  compileScheduledProgressWindow,
  type ScheduledProgressCandidate,
  type ScheduledProgressWindowInput,
} from "./scheduled-progress-window.js";

const branch = "monday-platform-genesis-01";
const liveHead = "648c84bdb74a843c180451cee84dc060ee74faf4";
const previousStatusHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function candidate(overrides: Partial<ScheduledProgressCandidate> = {}): ScheduledProgressCandidate {
  return {
    move_class: "external_platform_embodiment",
    branch,
    base_head_sha: liveHead,
    artifact_class: "scheduled_progress_window",
    changed_files: ["platform/packages/route-governor/src/scheduled-progress-window.ts"],
    executable_artifacts: ["compileScheduledProgressWindow"],
    routing_artifacts: ["one progress slot per scheduled finalization invocation"],
    proof_artifacts: ["dist/scheduled-progress-window.test.js"],
    new_check_run_ids: [],
    ...overrides,
  };
}

function input(overrides: Partial<ScheduledProgressWindowInput> = {}): ScheduledProgressWindowInput {
  return {
    invocation_id: "scheduled-run-2026-06-13T17-04-02-IDT",
    spent_invocation_ids: [],
    active_branch: branch,
    live_head_sha: liveHead,
    previous_status_head_sha: previousStatusHead,
    status_authority: "current_head_passing_with_warnings",
    progress_slots_spent: 0,
    max_progress_slots: 1,
    candidate: candidate(),
    ...overrides,
  };
}

test("admits one executable embodiment for a scheduled invocation", () => {
  const verdict = compileScheduledProgressWindow(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_scheduled_embodiment");
  assert.equal(verdict.consumed_progress_slots, 1);
  assert.deepEqual(verdict.blockers, []);
  assert.ok(verdict.decisive_evidence.includes("scheduled_progress_window"));
});

test("blocks stacking another progress event in the same scheduled invocation", () => {
  const verdict = compileScheduledProgressWindow(input({ progress_slots_spent: 1 }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_progress_slot_exhausted");
  assert.match(verdict.next_route, /first valid progress event only/);
});

test("blocks stale candidate heads", () => {
  const verdict = compileScheduledProgressWindow(
    input({ candidate: candidate({ base_head_sha: previousStatusHead }) }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_branch_or_head_mismatch");
  assert.ok(verdict.blockers.some((blocker) => blocker.includes(previousStatusHead)));
});

test("blocks non-progress move classes", () => {
  const verdict = compileScheduledProgressWindow(
    input({ candidate: candidate({ move_class: "metadata_reread", changed_files: [], executable_artifacts: [], routing_artifacts: [], proof_artifacts: [] }) }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_progress_candidate");
});

test("admits a fresh readback only when the head moved or live checks are new", () => {
  const moved = compileScheduledProgressWindow(
    input({ candidate: candidate({ move_class: "fresh_status_readback", changed_files: [], executable_artifacts: [], routing_artifacts: [], proof_artifacts: [] }) }),
  );
  assert.equal(moved.ok, true);
  assert.equal(moved.action, "admit_scheduled_readback");

  const stale = compileScheduledProgressWindow(
    input({
      previous_status_head_sha: liveHead,
      candidate: candidate({ move_class: "fresh_status_readback", changed_files: [], executable_artifacts: [], routing_artifacts: [], proof_artifacts: [] }),
    }),
  );
  assert.equal(stale.ok, false);
  assert.equal(stale.action, "block_status_authority");
});

test("blocks embodiment without live-head status authority", () => {
  const verdict = compileScheduledProgressWindow(input({ status_authority: "missing_status_surface" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_status_authority");
});
