import assert from "node:assert/strict";

import {
  selectNextEmbodimentIncrement,
  type NextEmbodimentCandidate,
  type NextEmbodimentSelectorInput,
} from "./next-embodiment-selector.js";

const branch = "monday-platform-genesis-01";
const head = "8235a00888262026d3883da35be3e6bc21cc0ea4";

function candidate(overrides: Partial<NextEmbodimentCandidate> = {}): NextEmbodimentCandidate {
  return {
    candidate_id: "runtime-queue-adapter",
    branch,
    live_head_sha: head,
    move_class: "external_platform_embodiment",
    artifact_class: "next-embodiment-selector",
    capability_axis: "runtime_execution",
    changed_files: ["platform/packages/route-governor/src/next-embodiment-selector.ts"],
    executable_artifacts: ["selectNextEmbodimentIncrement"],
    routing_artifacts: ["selects the strongest non-repeated executable embodiment before status replay"],
    proof_artifacts: ["dist/next-embodiment-selector-proof.js"],
    compounds_future_runs: true,
    decisive_weight: 10,
    ...overrides,
  };
}

function input(overrides: Partial<NextEmbodimentSelectorInput> = {}): NextEmbodimentSelectorInput {
  return {
    active_branch: branch,
    live_head_sha: head,
    spent_move_classes: ["fresh_status_readback"],
    spent_artifact_classes: ["status-to-embodiment-handoff"],
    prohibited_move_classes: ["metadata_reread", "duplicate_ci_summary", "old_repaired_head_blocker"],
    candidates: [candidate()],
    ...overrides,
  };
}

const selected = selectNextEmbodimentIncrement(input());
assert.equal(selected.ok, true);
assert.equal(selected.decision, "select_next_embodiment");
assert.equal(selected.selected?.candidate_id, "runtime-queue-adapter");
assert.equal(selected.selected?.capability_axis, "runtime_execution");
assert.match(selected.next_route, /resulting new head/);

const strongerAxisWins = selectNextEmbodimentIncrement(
  input({
    candidates: [
      candidate({
        candidate_id: "source-router",
        capability_axis: "source_routing",
        artifact_class: "source-router-extension",
        decisive_weight: 100,
      }),
      candidate({
        candidate_id: "runtime-executor",
        capability_axis: "runtime_execution",
        artifact_class: "runtime-executor-extension",
        decisive_weight: 1,
      }),
    ],
  }),
);
assert.equal(strongerAxisWins.ok, true);
assert.equal(strongerAxisWins.selected?.candidate_id, "runtime-executor");

const replayRejected = selectNextEmbodimentIncrement(
  input({ candidates: [candidate({ candidate_id: "status-replay", move_class: "fresh_status_readback" })] }),
);
assert.equal(replayRejected.ok, false);
assert.equal(replayRejected.decision, "block_no_selectable_embodiment");
assert.deepEqual(replayRejected.rejected[0]?.blockers, [
  "candidate repeats non-progress move class: fresh_status_readback",
  "candidate move class is already spent: fresh_status_readback",
]);

const spentArtifactRejected = selectNextEmbodimentIncrement(
  input({ candidates: [candidate({ artifact_class: "status-to-embodiment-handoff" })] }),
);
assert.equal(spentArtifactRejected.ok, false);
assert.deepEqual(spentArtifactRejected.rejected[0]?.blockers, [
  "candidate artifact class is already spent: status-to-embodiment-handoff",
]);

const wrongTargetRejected = selectNextEmbodimentIncrement(
  input({ candidates: [candidate({ branch: "main", live_head_sha: "old-head" })] }),
);
assert.equal(wrongTargetRejected.ok, false);
assert.deepEqual(wrongTargetRejected.rejected[0]?.blockers, [
  "candidate branch main does not match active branch monday-platform-genesis-01",
  "candidate head old-head does not match live head 8235a00888262026d3883da35be3e6bc21cc0ea4",
]);

const incompleteRejected = selectNextEmbodimentIncrement(
  input({
    candidates: [
      candidate({
        changed_files: ["platform/docs/readme.md"],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
        compounds_future_runs: false,
      }),
    ],
  }),
);
assert.equal(incompleteRejected.ok, false);
assert.deepEqual(incompleteRejected.rejected[0]?.blockers, [
  "candidate does not change executable platform files",
  "candidate has no executable artifact evidence",
  "candidate has no future-routing artifact evidence",
  "candidate has no proof artifact evidence",
  "candidate does not compound future runs",
]);

console.log("next embodiment selector proof passed");
