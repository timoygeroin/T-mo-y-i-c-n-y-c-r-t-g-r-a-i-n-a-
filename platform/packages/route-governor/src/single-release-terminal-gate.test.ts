import assert from "node:assert/strict";
import { test } from "node:test";

import {
  enforceSingleReleaseTerminalGate,
  type SingleReleaseTerminalGateInput,
  type TerminalReleaseCandidate,
} from "./single-release-terminal-gate.js";

const branch = "monday-platform-genesis-01";
const liveHead = "14e6529d249e3d85e605ea3b2a9b4bf0864c871b";
const priorStatusHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function embodimentCandidate(overrides: Partial<TerminalReleaseCandidate> = {}): TerminalReleaseCandidate {
  return {
    release_id: "single-terminal-gate-embodiment",
    release_class: "external_platform_embodiment",
    branch,
    base_head_sha: liveHead,
    changed_files: ["platform/packages/route-governor/src/single-release-terminal-gate.ts"],
    executable_artifacts: ["enforceSingleReleaseTerminalGate"],
    routing_artifacts: ["exactly one scheduled release class survives before output"],
    status_surfaces: [],
    ...overrides,
  };
}

function input(overrides: Partial<SingleReleaseTerminalGateInput> = {}): SingleReleaseTerminalGateInput {
  return {
    active_branch: branch,
    live_head_sha: liveHead,
    prior_status_head_sha: priorStatusHead,
    prohibited_release_classes: [
      "pr_metadata_reread",
      "duplicate_ci_summary",
      "duplicate_comment",
      "local_memory_guard",
      "guessed_future_ci",
      "reclose_resolved_blocker",
    ],
    candidates: [embodimentCandidate()],
    ...overrides,
  };
}

test("admits one complete external embodiment terminal release", () => {
  const verdict = enforceSingleReleaseTerminalGate(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_single_external_embodiment");
  assert.equal(verdict.admitted_release_id, "single-terminal-gate-embodiment");
  assert.deepEqual(verdict.blockers, []);
  assert.match(verdict.next_route, /require status readback/);
});

test("blocks bundling status readback and embodiment as one progress claim", () => {
  const verdict = enforceSingleReleaseTerminalGate(
    input({
      candidates: [
        embodimentCandidate(),
        embodimentCandidate({
          release_id: "fresh-current-head-status",
          release_class: "fresh_status_readback",
          status_head_sha: liveHead,
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          status_surfaces: ["Route Governor Proof / Route governor proof examples"],
        }),
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_multiple_terminal_releases");
  assert.deepEqual(verdict.blockers, [
    "single-terminal-gate-embodiment:external_platform_embodiment",
    "fresh-current-head-status:fresh_status_readback",
  ]);
});

test("blocks prohibited non-progress release classes before terminal selection", () => {
  const verdict = enforceSingleReleaseTerminalGate(
    input({
      prohibited_release_classes: ["exact_external_blocker"],
      candidates: [
        embodimentCandidate({
          release_id: "old-repaired-head-blocker",
          release_class: "exact_external_blocker",
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          blocker_text: "old repaired-head status-readback blocker",
        }),
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_forbidden_release");
  assert.deepEqual(verdict.blockers, ["terminal release class is prohibited: exact_external_blocker"]);
});

test("blocks incomplete external embodiment candidates", () => {
  const verdict = enforceSingleReleaseTerminalGate(
    input({
      candidates: [
        embodimentCandidate({
          changed_files: ["README.md"],
          executable_artifacts: [],
          routing_artifacts: [],
        }),
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_terminal_release");
  assert(verdict.blockers.includes("terminal release candidate single-terminal-gate-embodiment changes no executable platform file"));
  assert(verdict.blockers.includes("terminal release candidate single-terminal-gate-embodiment has no executable artifact evidence"));
  assert(verdict.blockers.includes("terminal release candidate single-terminal-gate-embodiment has no future-routing artifact evidence"));
});

test("admits exactly one fresh live-head status readback when the prior status head differs", () => {
  const verdict = enforceSingleReleaseTerminalGate(
    input({
      candidates: [
        embodimentCandidate({
          release_id: "fresh-current-head-status",
          release_class: "fresh_status_readback",
          status_head_sha: liveHead,
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          status_surfaces: ["PR Head Status Readback / Read PR head status"],
        }),
      ],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_single_status_readback");
});

test("blocks a status readback repeated for the already-read live head", () => {
  const verdict = enforceSingleReleaseTerminalGate(
    input({
      prior_status_head_sha: liveHead,
      candidates: [
        embodimentCandidate({
          release_id: "duplicate-current-head-status",
          release_class: "fresh_status_readback",
          status_head_sha: liveHead,
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          status_surfaces: ["PR Head Status Readback / Read PR head status"],
        }),
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_terminal_release");
  assert.deepEqual(verdict.blockers, [`terminal status candidate duplicate-current-head-status repeats status for ${liveHead}`]);
});
