import assert from "node:assert/strict";
import test from "node:test";

import {
  authorizeSourceRankedTerminalAct,
  type SourceRankedTerminalActAuthorityInput,
} from "./source-ranked-terminal-act-authority.js";

const liveHead = "42df1ef4745d234c3ccdb03c71a2e55f23ef24b2";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function input(overrides: Partial<SourceRankedTerminalActAuthorityInput> = {}): SourceRankedTerminalActAuthorityInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    previous_status_head_sha: "21acec07f485b12f6933a1f894a035880e400a02",
    resolved_repaired_head_shas: [repairedHead],
    prohibited_act_classes: [
      "metadata_reread",
      "duplicate_ci_summary",
      "duplicate_comment",
      "duplicate_label",
      "local_memory_guard",
      "guessed_future_ci",
      "reclose_completed_blocker",
    ],
    prohibited_blocker_fragments: [repairedHead, "repaired-head status-readback blocker"],
    surfaces: [
      {
        surface_id: "live-pr-metadata",
        kind: "live_pr_metadata",
        branch: "monday-platform-genesis-01",
        head_sha: liveHead,
        evidence: ["PR #2 open", "non-draft", "mergeable true"],
      },
      {
        surface_id: "stale-pr-body-summary",
        kind: "pr_body_summary",
        branch: "monday-platform-genesis-01",
        head_sha: repairedHead,
        evidence: ["resolved repaired-head readback"],
      },
    ],
    candidate: {
      act_class: "external_platform_embodiment",
      branch: "monday-platform-genesis-01",
      base_head_sha: liveHead,
      changed_files: ["platform/packages/route-governor/src/source-ranked-terminal-act-authority.ts"],
      behavior_exports: ["authorizeSourceRankedTerminalAct"],
      routing_effects: [
        "current live PR metadata outranks stale PR-body and memory summaries for terminal finalization acts",
      ],
      proof_artifacts: ["source-ranked-terminal-act-authority.test.ts"],
    },
    ...overrides,
  };
}

test("authorizes behavior-bearing embodiment while retiring stale summary heads", () => {
  const verdict = authorizeSourceRankedTerminalAct(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "authorize_external_platform_embodiment");
  assert.equal(verdict.head_sha, liveHead);
  assert.deepEqual(verdict.accepted_surface_ids, ["live-pr-metadata"]);
  assert.deepEqual(verdict.summary_surface_ids, ["stale-pr-body-summary"]);
  assert.ok(verdict.retired_head_shas.includes(repairedHead));
  assert.ok(verdict.decisive_evidence.includes("authorizeSourceRankedTerminalAct"));
});

test("blocks non-progress terminal acts even when live metadata is present", () => {
  const verdict = authorizeSourceRankedTerminalAct(
    input({
      candidate: {
        ...input().candidate,
        act_class: "metadata_reread",
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_progress_act");
  assert.deepEqual(verdict.blockers, ["terminal act class is not progress: metadata_reread"]);
});

test("admits moved-head status readback without replaying repaired-head authority", () => {
  const verdict = authorizeSourceRankedTerminalAct(
    input({
      candidate: {
        ...input().candidate,
        act_class: "fresh_status_readback",
        changed_files: [],
        behavior_exports: [],
        routing_effects: [],
        proof_artifacts: [],
      },
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "authorize_fresh_status_readback");
  assert.ok(verdict.decisive_evidence.some((entry) => entry.includes("head moved from")));
});

test("blocks repaired-head blocker reuse as exact blocker progress", () => {
  const verdict = authorizeSourceRankedTerminalAct(
    input({
      candidate: {
        ...input().candidate,
        act_class: "exact_external_blocker",
        changed_files: [],
        behavior_exports: [],
        routing_effects: [],
        proof_artifacts: [],
        blocker: `repaired-head status-readback blocker for ${repairedHead}`,
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_repaired_head_blocker_reuse");
});