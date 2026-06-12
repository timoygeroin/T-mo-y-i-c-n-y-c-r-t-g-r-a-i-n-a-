import assert from "node:assert/strict";
import { test } from "node:test";

import { routeLivePromptHead, type LivePromptHeadCandidate, type LivePromptHeadRouterInput } from "./live-prompt-head-router.js";

const branch = "monday-platform-genesis-01";
const liveHead = "252792198dccddea23f850c0b917eff1c65b46dc";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function candidate(overrides: Partial<LivePromptHeadCandidate> = {}): LivePromptHeadCandidate {
  return {
    candidate_id: "live-prompt-head-router",
    active_branch: branch,
    live_head_sha: liveHead,
    prompt_head_sha: repairedHead,
    previous_resolved_head_sha: repairedHead,
    move_class: "external_platform_embodiment",
    changed_files: ["platform/packages/route-governor/src/live-prompt-head-router.ts"],
    executable_artifacts: ["routeLivePromptHead"],
    routing_artifacts: ["resolved prompt heads cannot drive the next PR move after the live head advances"],
    proof_artifacts: ["dist/live-prompt-head-router-proof.js"],
    ...overrides,
  };
}

function input(overrides: Partial<LivePromptHeadRouterInput> = {}): LivePromptHeadRouterInput {
  return {
    active_branch: branch,
    live_head_sha: liveHead,
    resolved_head_shas: [repairedHead],
    spent_candidate_ids: [],
    candidate: candidate(),
    ...overrides,
  };
}

test("admits executable embodiment when the prompt head is resolved but the candidate is live-head bound", () => {
  const verdict = routeLivePromptHead(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_runtime_embodiment");
  assert.equal(verdict.admitted_candidate_id, "live-prompt-head-router");
  assert.ok(verdict.decisive_evidence.includes("routeLivePromptHead"));
});

test("blocks old repaired-head blocker replay after the PR head moves", () => {
  const verdict = routeLivePromptHead(
    input({
      candidate: candidate({
        move_class: "old_blocker_replay",
        blocker: `old repaired-head blocker for ${repairedHead}`,
      }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_head_replay");
  assert.deepEqual(verdict.blockers, [`resolved prompt head cannot drive the next move: ${repairedHead}`]);
});

test("blocks metadata and warning-maintenance classes as non-progress", () => {
  const metadata = routeLivePromptHead(input({ candidate: candidate({ move_class: "metadata_reread" }) }));
  const warning = routeLivePromptHead(input({ candidate: candidate({ move_class: "warning_repair" }) }));

  assert.equal(metadata.ok, false);
  assert.equal(metadata.action, "block_duplicate_or_metadata");
  assert.equal(warning.ok, false);
  assert.equal(warning.action, "block_duplicate_or_metadata");
});

test("admits fresh status only when a status surface is bound to the live head", () => {
  const stale = routeLivePromptHead(
    input({
      candidate: candidate({
        candidate_id: "stale-status-readback",
        move_class: "fresh_status_readback",
        status_surfaces: [{ id: "old-check", head_sha: repairedHead, conclusion: "success" }],
      }),
    }),
  );

  assert.equal(stale.ok, false);
  assert.equal(stale.action, "block_incomplete_candidate");

  const live = routeLivePromptHead(
    input({
      candidate: candidate({
        candidate_id: "live-status-readback",
        move_class: "fresh_status_readback",
        status_surfaces: [{ id: "live-check", head_sha: liveHead, conclusion: "success" }],
      }),
    }),
  );

  assert.equal(live.ok, true);
  assert.equal(live.action, "admit_fresh_status_readback");
});

test("requires exact external blockers to name the live head", () => {
  const missingHead = routeLivePromptHead(
    input({ candidate: candidate({ candidate_id: "weak-blocker", move_class: "exact_external_blocker", blocker: "Actions log surface unavailable" }) }),
  );

  assert.equal(missingHead.ok, false);
  assert.equal(missingHead.action, "block_incomplete_candidate");

  const liveBlocker = routeLivePromptHead(
    input({
      candidate: candidate({
        candidate_id: "live-head-blocker",
        move_class: "exact_external_blocker",
        blocker: `external blocker for live head ${liveHead}: Actions log surface unavailable in this runtime`,
      }),
    }),
  );

  assert.equal(liveBlocker.ok, true);
  assert.equal(liveBlocker.action, "emit_exact_external_blocker");
});

test("blocks spent candidates and incomplete executable candidates", () => {
  const spent = routeLivePromptHead(input({ spent_candidate_ids: ["live-prompt-head-router"] }));
  const incomplete = routeLivePromptHead(
    input({
      candidate: candidate({
        candidate_id: "incomplete-live-router",
        changed_files: ["platform/docs/live-router.md"],
        executable_artifacts: [],
      }),
    }),
  );

  assert.equal(spent.ok, false);
  assert.equal(spent.action, "block_spent_candidate");
  assert.equal(incomplete.ok, false);
  assert.equal(incomplete.action, "block_incomplete_candidate");
});
