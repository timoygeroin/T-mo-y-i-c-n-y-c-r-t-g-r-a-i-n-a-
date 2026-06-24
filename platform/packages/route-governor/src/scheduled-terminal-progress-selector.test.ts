import test from "node:test";
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

function input(overrides: Partial<ScheduledTerminalProgressSelectorInput> = {}): ScheduledTerminalProgressSelectorInput {
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

test("selects executable embodiment over a fresh status candidate", () => {
  const verdict = selectScheduledTerminalProgress(
    input({
      candidates: [
        {
          candidate_id: "fresh-readback",
          progress_class: "fresh_status_readback",
          branch,
          base_head_sha: liveHead,
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          proof_artifacts: [],
          new_check_runs: [{ id: "27099900001", head_sha: liveHead, name: "Route Governor Proof" }],
        },
        embodiment(),
      ],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "select_external_embodiment");
  assert.equal(verdict.selected?.candidate_id, "terminal-selector-embodiment");
  assert.ok(verdict.quarantined_heads.includes(repairedHead));
});

test("rejects the explicitly exhausted non-progress classes", () => {
  const verdict = selectScheduledTerminalProgress(
    input({
      candidates: [
        embodiment({
          candidate_id: "metadata-reread",
          progress_class: "pr_metadata_reread",
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          proof_artifacts: [],
        }),
        embodiment({
          candidate_id: "duplicate-label",
          progress_class: "duplicate_label",
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          proof_artifacts: [],
        }),
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_no_terminal_candidate");
  assert.equal(verdict.rejected.length, 2);
  assert.ok(verdict.rejected.every((candidate) => candidate.reasons.some((reason) => reason.includes("non-progress"))));
});

test("blocks embodiment candidates based on the old repaired head", () => {
  const verdict = selectScheduledTerminalProgress(
    input({
      candidates: [embodiment({ base_head_sha: repairedHead })],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.ok(verdict.quarantined_heads.includes(repairedHead));
  assert.ok(verdict.rejected[0]?.reasons.some((reason) => reason.includes(`not live head ${liveHead}`)));
});

test("admits exact blocker when live status is failing and embodiment is blocked", () => {
  const verdict = selectScheduledTerminalProgress(
    input({
      live_status_verdict: "failing",
      candidates: [
        embodiment(),
        {
          candidate_id: "exact-live-failure-blocker",
          progress_class: "exact_external_blocker",
          branch,
          base_head_sha: liveHead,
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          proof_artifacts: [],
          new_check_runs: [],
          blocker: "live-head route-governor proof examples are failing",
        },
      ],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "select_exact_external_blocker");
  assert.equal(verdict.selected?.candidate_id, "exact-live-failure-blocker");
});

test("rejects stale check runs on non-live heads for fresh status readback", () => {
  const verdict = selectScheduledTerminalProgress(
    input({
      previous_status_head_sha: liveHead,
      candidates: [
        {
          candidate_id: "stale-check-readback",
          progress_class: "fresh_status_readback",
          branch,
          base_head_sha: liveHead,
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          proof_artifacts: [],
          new_check_runs: [{ id: "27049650678", head_sha: repairedHead, name: "Monday Platform CI" }],
        },
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.ok(verdict.rejected[0]?.reasons.includes("fresh status readback includes stale check runs from a non-live head"));
});
