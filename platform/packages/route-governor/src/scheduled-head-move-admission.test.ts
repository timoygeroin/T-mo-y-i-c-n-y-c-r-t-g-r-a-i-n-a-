import test from "node:test";
import assert from "node:assert/strict";

import { admitScheduledHeadMove, type ScheduledHeadMoveAdmissionInput } from "./scheduled-head-move-admission.js";

const activeBranch = "monday-platform-genesis-01";
const promptHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "e794f250fad97a8d25fd158bc16ac01e6dc7b44a";

function baseInput(overrides: Partial<ScheduledHeadMoveAdmissionInput> = {}): ScheduledHeadMoveAdmissionInput {
  return {
    active_branch: activeBranch,
    prompt_head_sha: promptHead,
    live_head_sha: liveHead,
    last_status_readback_head_sha: "3bf8e07dce32e59accf776357fb22278f57ba3f5",
    candidate: {
      move_class: "external_platform_embodiment",
      branch: activeBranch,
      base_head_sha: liveHead,
      changed_files: ["platform/packages/route-governor/src/scheduled-head-move-admission.ts"],
      executable_artifacts: ["admitScheduledHeadMove"],
      routing_artifacts: ["scheduled moved-head admission"],
      proof_artifacts: ["scheduled-head-move-admission.test"],
    },
    ...overrides,
  };
}

test("routes a scheduled moved head to live-head readback before embodiment", () => {
  const verdict = admitScheduledHeadMove(baseInput());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_moved_head_status_readback");
  assert.equal(verdict.quarantined_prompt_head, promptHead);
  assert.equal(verdict.expired_status_head_sha, "3bf8e07dce32e59accf776357fb22278f57ba3f5");
});

test("admits embodiment only after a passing status surface is bound to the live head", () => {
  const verdict = admitScheduledHeadMove(
    baseInput({
      prompt_head_sha: liveHead,
      last_status_readback_head_sha: liveHead,
      status_surface: {
        surface_id: "checks:e794f250",
        head_sha: liveHead,
        verdict: "passing_with_warnings",
        decisive_successes: ["Route Governor Proof succeeded", "Monday Platform CI succeeded"],
        blocking_failures: [],
        pending_surfaces: [],
        non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
      },
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_current_head_embodiment");
  assert.deepEqual(verdict.blockers, []);
});

test("rejects stale status surfaces and stale candidate bases", () => {
  const staleStatus = admitScheduledHeadMove(
    baseInput({
      status_surface: {
        surface_id: "checks:old-head",
        head_sha: promptHead,
        verdict: "passing",
        decisive_successes: ["old head succeeded"],
        blocking_failures: [],
        pending_surfaces: [],
        non_blocking_warnings: [],
      },
    }),
  );

  assert.equal(staleStatus.ok, false);
  assert.equal(staleStatus.action, "block_stale_status_surface");

  const staleCandidate = admitScheduledHeadMove(
    baseInput({ candidate: { ...baseInput().candidate, base_head_sha: promptHead } }),
  );

  assert.equal(staleCandidate.ok, false);
  assert.equal(staleCandidate.action, "block_stale_candidate_base");
});

test("surfaces exact blockers without pretending they are embodiment", () => {
  const verdict = admitScheduledHeadMove(
    baseInput({
      candidate: {
        ...baseInput().candidate,
        move_class: "exact_external_blocker",
        blocker: "external reviewer permission boundary is unavailable for PR #2",
      },
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "emit_exact_external_blocker");
  assert.deepEqual(verdict.blockers, ["external reviewer permission boundary is unavailable for PR #2"]);
});
