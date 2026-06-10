import assert from "node:assert/strict";

import { routeLiveBlockerRetirement, type LiveBlockerRetirementInput } from "./live-blocker-retirement.js";

const branch = "monday-platform-genesis-01";
const liveHead = "cbf685410f32d8a5a76f4020630205f3e3626f90";
const supersededHead = "df3a4035d6841ae19cc32443f0d4ef11449e65ac";

function input(overrides: Partial<LiveBlockerRetirementInput> = {}): LiveBlockerRetirementInput {
  return {
    branch,
    active_branch: branch,
    live_head_sha: liveHead,
    last_readback_head_sha: supersededHead,
    status_verdict: "no_status_surface",
    requested_move_class: "fresh_status_readback",
    ...overrides,
  };
}

const staleBlocker = routeLiveBlockerRetirement(
  input({
    blocker: {
      blocker_id: "superseded-current-head-failure",
      head_sha: supersededHead,
      blocker_text: "Route governor proof examples failed on a superseded head",
      required_surface: "live-head status readback",
    },
  }),
);
assert.equal(staleBlocker.ok, true);
assert.equal(staleBlocker.action, "retire_stale_blocker_and_read_live_status");
assert.deepEqual(staleBlocker.retired_blocker_ids, ["superseded-current-head-failure"]);

const liveBlocker = routeLiveBlockerRetirement(
  input({
    blocker: {
      blocker_id: "live-current-head-failure",
      head_sha: liveHead,
      blocker_text: "current live head still has a concrete proof failure",
      required_surface: "failing assertion line",
    },
  }),
);
assert.equal(liveBlocker.ok, false);
assert.equal(liveBlocker.action, "hold_live_blocker");
assert.deepEqual(liveBlocker.retired_blocker_ids, []);

const embodiment = routeLiveBlockerRetirement(
  input({
    status_verdict: "passing",
    requested_move_class: "external_platform_embodiment",
    candidate: {
      candidate_id: "live-blocker-retirement-router",
      artifact_class: "live-blocker-retirement",
      changed_files: ["platform/packages/route-governor/src/live-blocker-retirement.ts"],
      executable_artifacts: ["routeLiveBlockerRetirement"],
      routing_artifacts: ["superseded blockers retire only through moved-head evidence"],
      proof_artifacts: ["dist/live-blocker-retirement-proof.js"],
      spent_artifact_classes: [],
    },
  }),
);
assert.equal(embodiment.ok, true);
assert.equal(embodiment.action, "admit_external_embodiment");

console.log("live blocker retirement proof passed");
