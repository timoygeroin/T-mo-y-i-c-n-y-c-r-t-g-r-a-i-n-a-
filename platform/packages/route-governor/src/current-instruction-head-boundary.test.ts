import assert from "node:assert/strict";
import { test } from "node:test";

import {
  arbitrateCurrentInstructionHeadBoundary,
  type CurrentInstructionEmbodimentCandidate,
  type CurrentInstructionHeadBoundaryInput,
} from "./current-instruction-head-boundary.js";

const branch = "monday-platform-genesis-01";
const instructionHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "3151bdc7903cdc257dc93d5b203edb9f623e43bf";

function candidate(overrides: Partial<CurrentInstructionEmbodimentCandidate> = {}): CurrentInstructionEmbodimentCandidate {
  return {
    move_class: "external_platform_embodiment",
    base_head_sha: liveHead,
    changed_files: ["platform/packages/route-governor/src/current-instruction-head-boundary.ts"],
    executable_artifacts: ["arbitrateCurrentInstructionHeadBoundary"],
    routing_artifacts: ["current instruction authority is preserved while live head fact wins"],
    ...overrides,
  };
}

function input(overrides: Partial<CurrentInstructionHeadBoundaryInput> = {}): CurrentInstructionHeadBoundaryInput {
  return {
    active_branch: branch,
    instruction_branch: branch,
    instruction_head_sha: instructionHead,
    live_head_sha: liveHead,
    resolved_repaired_head_sha: instructionHead,
    repaired_head_status_resolved: true,
    prohibited_blockers: ["repaired-head status readback missing for b38ea247602ae8ebba80c4120ad03b41b26bd841"],
    candidate: candidate(),
    ...overrides,
  };
}

test("admits a live-head embodiment while preserving a stale instruction head as resolved history", () => {
  const verdict = arbitrateCurrentInstructionHeadBoundary(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_live_head_embodiment");
  assert.equal(verdict.head_sha, liveHead);
  assert.equal(verdict.instruction_head_allowed_as_current, false);
  assert.equal(verdict.historical_head_sha, instructionHead);
  assert.equal(verdict.quarantined_head_sha, instructionHead);
  assert.ok(verdict.decisive_evidence.includes(`resolved repaired head preserved as history ${instructionHead}`));
});

test("blocks candidates that still use the stale instruction head as their base", () => {
  const verdict = arbitrateCurrentInstructionHeadBoundary(
    input({ candidate: candidate({ base_head_sha: instructionHead }) }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_instruction_head_as_current");
  assert.deepEqual(verdict.blockers, [`candidate base ${instructionHead} is not live PR head ${liveHead}`]);
});

test("blocks the prohibited repaired-head blocker even when the instruction carries that head", () => {
  const blocker = "repaired-head status readback missing for b38ea247602ae8ebba80c4120ad03b41b26bd841";
  const verdict = arbitrateCurrentInstructionHeadBoundary(
    input({ candidate: candidate({ move_class: "exact_external_blocker", blocker }) }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_prohibited_instruction_blocker");
  assert.deepEqual(verdict.blockers, [`prohibited blocker cannot be emitted from current instruction: ${blocker}`]);
});

test("routes fresh readback to the live head when the instruction head is stale", () => {
  const verdict = arbitrateCurrentInstructionHeadBoundary(
    input({
      candidate: candidate({
        move_class: "fresh_status_readback",
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
      }),
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "read_live_head_status");
  assert.equal(verdict.head_sha, liveHead);
  assert.ok(verdict.decisive_evidence.includes(`instruction-carried head ${instructionHead} is not current`));
});

test("blocks branch mismatch before accepting any current instruction route", () => {
  const verdict = arbitrateCurrentInstructionHeadBoundary(input({ instruction_branch: "main" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_branch_mismatch");
});

test("blocks incomplete live-head embodiment candidates", () => {
  const verdict = arbitrateCurrentInstructionHeadBoundary(
    input({
      candidate: candidate({
        changed_files: ["docs/current-instruction-head-boundary.md"],
        executable_artifacts: [],
        routing_artifacts: [],
      }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_embodiment");
  assert.ok(verdict.blockers.includes("embodiment candidate changes no executable platform file"));
});
