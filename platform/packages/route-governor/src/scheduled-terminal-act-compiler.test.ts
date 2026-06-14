import assert from "node:assert/strict";
import { test } from "node:test";

import {
  compileScheduledTerminalAct,
  type ScheduledTerminalActCandidate,
  type ScheduledTerminalActInput,
} from "./scheduled-terminal-act-compiler.js";

const BRANCH = "monday-platform-genesis-01";
const PREVIOUS_HEAD = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const LIVE_HEAD = "35e0189200e59a75f1013cb5fdb99ef19ef7ad6d";

function embodiment(overrides: Partial<ScheduledTerminalActCandidate> = {}): ScheduledTerminalActCandidate {
  return {
    candidate_id: "scheduled-terminal-act-compiler",
    act_class: "external_platform_embodiment",
    branch: BRANCH,
    base_head_sha: LIVE_HEAD,
    changed_files: [
      "platform/packages/route-governor/src/scheduled-terminal-act-compiler.ts",
      "platform/packages/route-governor/src/scheduled-terminal-act-compiler.test.ts",
    ],
    executable_artifacts: ["compileScheduledTerminalAct"],
    routing_artifacts: ["scheduled run selects exactly one terminal progress act"],
    proof_artifacts: ["scheduled-terminal-act-compiler.test"],
    new_check_runs: [],
    ...overrides,
  };
}

function input(candidates: ScheduledTerminalActCandidate[]): ScheduledTerminalActInput {
  return {
    active_branch: BRANCH,
    live_head_sha: LIVE_HEAD,
    previous_status_head_sha: PREVIOUS_HEAD,
    candidates,
  };
}

test("selects one external embodiment over simultaneous readback and blocker candidates", () => {
  const verdict = compileScheduledTerminalAct(
    input([
      embodiment(),
      embodiment({
        candidate_id: "fresh-moved-head-readback",
        act_class: "fresh_status_readback",
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
        new_check_runs: [{ id: "27049651467", head_sha: LIVE_HEAD, name: "PR Head Status Readback" }],
      }),
      embodiment({
        candidate_id: "exact-live-blocker",
        act_class: "exact_external_blocker",
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
        blocker: "live status surface unavailable for moved head",
      }),
    ]),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_single_external_embodiment");
  assert.equal(verdict.selected_candidate_id, "scheduled-terminal-act-compiler");
  assert.deepEqual(verdict.shadowed_terminal_candidate_ids, ["fresh-moved-head-readback", "exact-live-blocker"]);
  assert.match(verdict.next_route, /commit only the selected embodiment/);
});

test("rejects non-progress scheduled candidates", () => {
  const verdict = compileScheduledTerminalAct(
    input([
      embodiment({
        candidate_id: "duplicate-ci-summary",
        act_class: "duplicate_ci_summary",
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
      }),
    ]),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_progress_class");
  assert.deepEqual(verdict.rejected_candidate_ids, ["duplicate-ci-summary"]);
  assert.deepEqual(verdict.blockers, ["scheduled terminal act class is non-progress: duplicate_ci_summary"]);
});

test("blocks proof-only embodiment candidates", () => {
  const verdict = compileScheduledTerminalAct(
    input([
      embodiment({
        candidate_id: "proof-only",
        changed_files: ["platform/packages/route-governor/src/scheduled-terminal-act-compiler.test.ts"],
      }),
    ]),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_no_terminal_act");
  assert.deepEqual(verdict.blockers, ["external embodiment must change a behavior-bearing platform file, not only proof files"]);
});

test("admits a fresh status readback only when the head moved or new live-head checks exist", () => {
  const verdict = compileScheduledTerminalAct(
    input([
      embodiment({
        candidate_id: "fresh-status",
        act_class: "fresh_status_readback",
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
      }),
    ]),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_single_fresh_status_readback");
  assert.equal(verdict.selected_candidate_id, "fresh-status");

  const stale = compileScheduledTerminalAct({
    ...input([
      embodiment({
        candidate_id: "stale-status",
        act_class: "fresh_status_readback",
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
      }),
    ]),
    previous_status_head_sha: LIVE_HEAD,
  });

  assert.equal(stale.ok, false);
  assert.deepEqual(stale.blockers, ["fresh status readback requires a moved head or new live-head checks"]);
});

test("blocks candidates that are not bound to the active branch", () => {
  const verdict = compileScheduledTerminalAct(
    input([
      embodiment({
        candidate_id: "wrong-branch",
        branch: "main",
      }),
    ]),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_branch_mismatch");
  assert.deepEqual(verdict.blockers, ["candidate branch main does not match active branch monday-platform-genesis-01"]);
});
