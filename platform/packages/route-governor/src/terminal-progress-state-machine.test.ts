import assert from "node:assert/strict";
import test from "node:test";

import {
  reduceTerminalProgressState,
  type TerminalProgressEvent,
  type TerminalProgressStateMachineInput,
} from "./terminal-progress-state-machine.js";

const branch = "monday-platform-genesis-01";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "f92710230ca79cb009bf9d4db9f001d7d2cfbc06";

function embodiment(overrides: Partial<TerminalProgressEvent> = {}): TerminalProgressEvent {
  return {
    event_id: "terminal-state-machine-embodiment",
    branch,
    head_sha: liveHead,
    kind: "external_platform_embodiment",
    artifact_class: "terminal-progress-state-machine",
    changed_files: ["platform/packages/route-governor/src/terminal-progress-state-machine.ts"],
    executable_artifacts: ["reduceTerminalProgressState"],
    routing_artifacts: ["terminal cursor requires moved-head status before another status claim"],
    proof_artifacts: ["dist/terminal-progress-state-machine.test.js"],
    status_surface_ids: [],
    ...overrides,
  };
}

function status(overrides: Partial<TerminalProgressEvent> = {}): TerminalProgressEvent {
  return {
    event_id: "terminal-state-machine-status",
    branch,
    head_sha: liveHead,
    kind: "fresh_status_readback",
    changed_files: [],
    executable_artifacts: [],
    routing_artifacts: [],
    proof_artifacts: [],
    status_surface_ids: ["PR Head Status Readback / Read PR head status"],
    ...overrides,
  };
}

function input(overrides: Partial<TerminalProgressStateMachineInput> = {}): TerminalProgressStateMachineInput {
  return {
    active_branch: branch,
    live_head_sha: liveHead,
    prompt_head_sha: repairedHead,
    previous_status_head_sha: repairedHead,
    resolved_historical_heads: [repairedHead],
    events: [],
    ...overrides,
  };
}

test("quarantines the prompt repaired head and routes a moved head to live status readback", () => {
  const verdict = reduceTerminalProgressState(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.quarantined_prompt_head_sha, repairedHead);
  assert.equal(verdict.required_status_head_sha, liveHead);
  assert.equal(verdict.next_route, "read_live_head_status");
  assert.deepEqual(verdict.prohibited_next_progress_classes, ["external_platform_embodiment"]);
});

test("requires moved-head status after an executable embodiment event", () => {
  const verdict = reduceTerminalProgressState(input({ events: [embodiment()] }));

  assert.equal(verdict.ok, true);
  assert.equal(verdict.cursor_state, "needs_live_status");
  assert.equal(verdict.required_status_head_sha, liveHead);
  assert.equal(verdict.next_route, "read_live_head_status");
  assert.ok(verdict.spent_artifact_classes.includes("terminal-progress-state-machine"));
});

test("blocks repaired-head readback replay as a stale terminal event", () => {
  const verdict = reduceTerminalProgressState(
    input({
      events: [
        status({
          event_id: "old-repaired-head-status",
          head_sha: repairedHead,
          status_surface_ids: ["old repaired-head checks succeeded"],
        }),
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.next_route, "block_terminal_progress_state");
  assert.match(verdict.blockers.join("\n"), /resolved historical head/);
});

test("after live-head status is satisfied, selects external embodiment and prohibits duplicate readback", () => {
  const verdict = reduceTerminalProgressState(input({ previous_status_head_sha: liveHead, events: [status()] }));

  assert.equal(verdict.ok, true);
  assert.equal(verdict.cursor_state, "status_satisfied");
  assert.equal(verdict.next_route, "select_next_external_embodiment");
  assert.deepEqual(verdict.prohibited_next_progress_classes, ["fresh_status_readback"]);
});

test("blocks replayed terminal progress event ids", () => {
  const event = embodiment();
  const verdict = reduceTerminalProgressState(input({ events: [event, event] }));

  assert.equal(verdict.ok, false);
  assert.match(verdict.blockers.join("\n"), /replayed/);
});
