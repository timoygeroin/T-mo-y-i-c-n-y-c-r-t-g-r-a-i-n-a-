import assert from "node:assert/strict";

import {
  selectScheduledTerminalProgress,
  type ScheduledTerminalProgressCandidate,
  type ScheduledTerminalProgressSelectorInput,
} from "./scheduled-terminal-progress-selector.js";

const branch = "monday-platform-genesis-01";
const liveHead = "6df5d8028b2e7a24c1d05f197dc86c3e6307115f";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function embodiment(overrides: Partial<ScheduledTerminalProgressCandidate> = {}): ScheduledTerminalProgressCandidate {
  return {
    candidate_id: "terminal-selector-embodiment",
    progress_class: "external_platform_embodiment",
    branch,
    base_head_sha: liveHead,
    changed_files: ["platform/packages/route-governor/src/scheduled-terminal-progress-selector.ts"],
    executable_artifacts: ["selectScheduledTerminalProgress"],
    routing_artifacts: ["scheduled terminal progress selector"],
    proof_artifacts: ["platform/packages/route-governor/src/scheduled-terminal-progress-selector-proof.ts"],
    new_check_runs: [],
    ...overrides,
  };
}

function scenario(overrides: Partial<ScheduledTerminalProgressSelectorInput> = {}): ScheduledTerminalProgressSelectorInput {
  return {
    active_branch: branch,
    live_head_sha: liveHead,
    previous_status_head_sha: repairedHead,
    live_status_verdict: "passing_with_warnings",
    prohibited_progress_classes: [
      "pr_metadata_reread",
      "duplicate_ci_summary",
      "duplicate_comment",
      "duplicate_label",
      "local_memory_guard",
      "guessed_future_ci",
      "reclose_resolved_blocker",
      "old_repaired_head_blocker",
    ],
    resolved_historical_heads: [repairedHead],
    candidates: [embodiment()],
    ...overrides,
  };
}

const selected = selectScheduledTerminalProgress(scenario());
assert.equal(selected.ok, true);
assert.equal(selected.action, "select_external_embodiment");
assert.equal(selected.selected?.candidate_id, "terminal-selector-embodiment");
assert.ok(selected.quarantined_heads.includes(repairedHead));

const repeated = selectScheduledTerminalProgress(
  scenario({
    candidates: [
      embodiment({
        candidate_id: "old-repaired-head-blocker",
        progress_class: "old_repaired_head_blocker",
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
      }),
    ],
  }),
);
assert.equal(repeated.ok, false);
assert.ok(repeated.rejected[0]?.reasons.some((reason) => reason.includes("non-progress")));

const staleBase = selectScheduledTerminalProgress(scenario({ candidates: [embodiment({ base_head_sha: repairedHead })] }));
assert.equal(staleBase.ok, false);
assert.ok(staleBase.quarantined_heads.includes(repairedHead));

const failingStatus = selectScheduledTerminalProgress(
  scenario({
    live_status_verdict: "failing",
    candidates: [
      embodiment(),
      {
        candidate_id: "exact-current-head-blocker",
        progress_class: "exact_external_blocker",
        branch,
        base_head_sha: liveHead,
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
        new_check_runs: [],
        blocker: "live-head status surface is failing",
      },
    ],
  }),
);
assert.equal(failingStatus.ok, true);
assert.equal(failingStatus.action, "select_exact_external_blocker");

console.log("scheduled terminal progress selector proof passed");
