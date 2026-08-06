import assert from "node:assert/strict";
import { test } from "node:test";

import {
  arbitrateTerminalProgress,
  type TerminalProgressArbiterInput,
} from "./terminal-progress-arbiter.js";
import type { TerminalProgressClass } from "./finalization-terminal-progress-contract.js";

const branch = "monday-platform-genesis-01";
const liveHead = "d2e229f6797e37766ca61bf464a9533e4b4ef0b3";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const prohibited: TerminalProgressClass[] = [
  "pr_metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "guessed_future_ci",
  "reclose_resolved_blocker",
];

function input(overrides: Partial<TerminalProgressArbiterInput> = {}): TerminalProgressArbiterInput {
  return {
    active_branch: branch,
    live_head_sha: liveHead,
    previous_status_head_sha: repairedHead,
    prohibited_progress_classes: prohibited,
    resolved_historical_heads: [repairedHead],
    candidates: [],
    ...overrides,
  };
}

test("selects executable embodiment over a merely fresh moved-head readback", () => {
  const verdict = arbitrateTerminalProgress(
    input({
      candidates: [
        {
          candidate_id: "moved-head-readback",
          candidate: {
            progress_class: "fresh_status_readback",
            branch,
            base_head_sha: liveHead,
            changed_files: [],
            executable_artifacts: [],
            routing_artifacts: [],
            new_check_runs: [],
          },
        },
        {
          candidate_id: "terminal-progress-arbiter",
          candidate: {
            progress_class: "external_platform_embodiment",
            branch,
            base_head_sha: liveHead,
            changed_files: ["platform/packages/route-governor/src/terminal-progress-arbiter.ts"],
            executable_artifacts: ["arbitrateTerminalProgress"],
            routing_artifacts: ["terminal progress conflict arbitration"],
            proof_artifacts: ["dist/terminal-progress-arbiter-proof.js"],
            new_check_runs: [],
          },
        },
      ],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.selected?.candidate_id, "terminal-progress-arbiter");
  assert.equal(verdict.selected?.action, "admit_external_embodiment");
  assert.equal(verdict.quarantined_heads.includes(repairedHead), true);
  assert.match(verdict.next_route, /commit the selected embodiment/);
});

test("keeps fresh status readback selectable when no embodiment survives", () => {
  const verdict = arbitrateTerminalProgress(
    input({
      candidates: [
        {
          candidate_id: "docs-only-embodiment",
          candidate: {
            progress_class: "external_platform_embodiment",
            branch,
            base_head_sha: liveHead,
            changed_files: ["platform/docs/finalization.md"],
            executable_artifacts: [],
            routing_artifacts: [],
            proof_artifacts: [],
            new_check_runs: [],
          },
        },
        {
          candidate_id: "moved-head-readback",
          candidate: {
            progress_class: "fresh_status_readback",
            branch,
            base_head_sha: liveHead,
            changed_files: [],
            executable_artifacts: [],
            routing_artifacts: [],
            new_check_runs: [],
          },
        },
      ],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.selected?.candidate_id, "moved-head-readback");
  assert.equal(verdict.selected?.action, "admit_fresh_status_readback");
  assert.equal(verdict.rejected[0]?.action, "block_incomplete_embodiment");
});

test("rejects prohibited replay classes before terminal selection", () => {
  const verdict = arbitrateTerminalProgress(
    input({
      candidates: [
        {
          candidate_id: "duplicate-summary",
          candidate: {
            progress_class: "duplicate_ci_summary",
            branch,
            base_head_sha: liveHead,
            changed_files: [],
            executable_artifacts: [],
            routing_artifacts: [],
            new_check_runs: [],
          },
        },
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_no_terminal_progress_candidate");
  assert.deepEqual(verdict.blockers, ["no terminal progress candidate survived arbitration"]);
  assert.equal(verdict.rejected[0]?.action, "block_non_progress_class");
});

test("selects exact blocker only after stronger classes fail", () => {
  const verdict = arbitrateTerminalProgress(
    input({
      previous_status_head_sha: liveHead,
      candidates: [
        {
          candidate_id: "stale-readback",
          candidate: {
            progress_class: "fresh_status_readback",
            branch,
            base_head_sha: liveHead,
            changed_files: [],
            executable_artifacts: [],
            routing_artifacts: [],
            new_check_runs: [{ id: "old", head_sha: repairedHead, name: "old repaired-head check" }],
          },
        },
        {
          candidate_id: "exact-write-blocker",
          candidate: {
            progress_class: "exact_external_blocker",
            branch,
            base_head_sha: liveHead,
            changed_files: [],
            executable_artifacts: [],
            routing_artifacts: [],
            new_check_runs: [],
            blocker: "GitHub contents API denied writes to monday-platform-genesis-01",
          },
        },
      ],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.selected?.candidate_id, "exact-write-blocker");
  assert.equal(verdict.selected?.action, "admit_exact_external_blocker");
  assert.equal(verdict.rejected[0]?.action, "block_stale_status_readback");
});
