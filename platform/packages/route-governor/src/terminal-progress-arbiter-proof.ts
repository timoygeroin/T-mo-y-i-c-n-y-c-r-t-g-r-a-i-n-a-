import assert from "node:assert/strict";

import { arbitrateTerminalProgress } from "./terminal-progress-arbiter.js";
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

const verdict = arbitrateTerminalProgress({
  active_branch: branch,
  live_head_sha: liveHead,
  previous_status_head_sha: repairedHead,
  prohibited_progress_classes: prohibited,
  resolved_historical_heads: [repairedHead],
  candidates: [
    {
      candidate_id: "fresh-readback-head-moved",
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
        new_check_runs: [],
      },
    },
    {
      candidate_id: "duplicate-ci-summary",
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
});

assert.equal(verdict.ok, true);
assert.equal(verdict.action, "select_terminal_progress");
assert.equal(verdict.selected?.candidate_id, "terminal-progress-arbiter");
assert.equal(verdict.selected?.action, "admit_external_embodiment");
assert.equal(verdict.rejected.length, 1);
assert.equal(verdict.rejected[0]?.action, "block_non_progress_class");
assert.equal(verdict.quarantined_heads.includes(repairedHead), true);
assert.match(verdict.next_route, /commit the selected embodiment/);

console.log("terminal progress arbiter proof passed");
