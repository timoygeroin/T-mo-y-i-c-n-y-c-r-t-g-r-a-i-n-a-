import assert from "node:assert/strict";
import { test } from "node:test";

import {
  compileMovedHeadReadbackAdmission,
  type MovedHeadReadbackAdmissionInput,
  type MovedHeadReadbackCandidate,
} from "./moved-head-readback-admission.js";

const branch = "monday-platform-genesis-01";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "0ddc84517fb44cd1b9e3dd8f2c79703aca2b2e3e";

function candidate(overrides: Partial<MovedHeadReadbackCandidate> = {}): MovedHeadReadbackCandidate {
  return {
    move_class: "fresh_status_readback",
    base_head_sha: liveHead,
    changed_files: [],
    executable_artifacts: [],
    routing_artifacts: [],
    status_surfaces: [
      {
        surface_id: "Route Governor Proof / Route governor proof examples",
        head_sha: liveHead,
        verdict: "passing_with_warnings",
        log_detail_available: true,
      },
    ],
    ...overrides,
  };
}

function input(overrides: Partial<MovedHeadReadbackAdmissionInput> = {}): MovedHeadReadbackAdmissionInput {
  return {
    active_branch: branch,
    pr_branch: branch,
    prompt_head_sha: repairedHead,
    live_head_sha: liveHead,
    repaired_head_sha: repairedHead,
    repaired_head_status_resolved: true,
    candidate: candidate(),
    ...overrides,
  };
}

test("admits a status readback only when it is bound to the live moved head", () => {
  const verdict = compileMovedHeadReadbackAdmission(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_moved_head_status_readback");
  assert.deepEqual(verdict.quarantined_head_shas, [repairedHead]);
  assert.ok(verdict.decisive_evidence.includes("Route Governor Proof / Route governor proof examples: passing_with_warnings"));
});

test("emits the exact log-surface blocker for a failing live head without failure details", () => {
  const verdict = compileMovedHeadReadbackAdmission(
    input({
      candidate: candidate({
        status_surfaces: [
          {
            surface_id: "Route Governor Proof / Route governor proof examples",
            head_sha: liveHead,
            verdict: "failing",
            log_detail_available: false,
          },
        ],
      }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "emit_moved_head_log_blocker");
  assert.ok(verdict.blockers[0]?.startsWith("CURRENT_HEAD_FAILURE_LOG_SURFACE_INSUFFICIENT"));
  assert.match(verdict.next_route, /signed Actions logs/);
});

test("blocks replaying the resolved repaired head as current progress", () => {
  const verdict = compileMovedHeadReadbackAdmission(
    input({ candidate: candidate({ move_class: "repaired_head_replay", base_head_sha: repairedHead }) }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_repaired_head_replay");
  assert.ok(verdict.blockers.includes(`resolved repaired head cannot be reused as current progress: ${repairedHead}`));
});

test("blocks candidate bases that are not the live moved head", () => {
  const verdict = compileMovedHeadReadbackAdmission(
    input({ candidate: candidate({ base_head_sha: "1a0c8f200c4050ddb944284b7fd253ffc0b761dc" }) }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_candidate_base");
  assert.ok(verdict.blockers.includes(`candidate base 1a0c8f200c4050ddb944284b7fd253ffc0b761dc is not live PR head ${liveHead}`));
});

test("admits a complete executable embodiment on the live moved head", () => {
  const verdict = compileMovedHeadReadbackAdmission(
    input({
      candidate: candidate({
        move_class: "external_platform_embodiment",
        changed_files: ["platform/packages/route-governor/src/moved-head-readback-admission.ts"],
        executable_artifacts: ["compileMovedHeadReadbackAdmission"],
        routing_artifacts: ["moved-head admission quarantines repaired-head history before release"],
        status_surfaces: [],
      }),
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_moved_head_embodiment");
  assert.deepEqual(verdict.blockers, []);
});

test("blocks exact external blockers that replay the resolved repaired head", () => {
  const verdict = compileMovedHeadReadbackAdmission(
    input({
      candidate: candidate({
        move_class: "exact_external_blocker",
        status_surfaces: [],
        blocker: `CURRENT_HEAD_FAILURE_LOG_SURFACE_INSUFFICIENT for ${repairedHead}`,
      }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_repaired_head_replay");
});
