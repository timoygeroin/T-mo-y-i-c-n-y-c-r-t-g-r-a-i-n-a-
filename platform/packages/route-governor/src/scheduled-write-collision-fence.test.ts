import assert from "node:assert/strict";
import test from "node:test";

import {
  fenceScheduledWriteCollision,
  type ScheduledWriteCollisionFenceInput,
} from "./scheduled-write-collision-fence.js";

const branch = "monday-platform-genesis-01";
const liveHead = "9a3f3ce0f51414d16ba2cd5531e89037cca69122";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function input(overrides: Partial<ScheduledWriteCollisionFenceInput> = {}): ScheduledWriteCollisionFenceInput {
  return {
    active_branch: branch,
    live_head_sha: liveHead,
    repaired_historical_heads: [repairedHead],
    open_intent_ids: [],
    completed_intent_ids: [],
    spent_write_classes: ["post_write_status_escrow"],
    non_progress_move_classes: ["metadata_reread", "duplicate_ci_summary"],
    candidate: {
      intent_id: "scheduled-write-collision-fence-001",
      scheduler_invocation_id: "schedule-2026-06-19T13:04:02+03:00",
      move_class: "external_platform_embodiment",
      write_class: "scheduled_write_collision_fence",
      branch,
      observed_head_sha: liveHead,
      base_head_sha: liveHead,
      changed_files: [
        "platform/packages/route-governor/src/scheduled-write-collision-fence.ts",
        "platform/packages/route-governor/src/scheduled-write-collision-fence-proof.ts",
        "platform/packages/route-governor/src/index.ts",
        "platform/packages/route-governor/package.json",
      ],
      behavior_artifacts: ["fenceScheduledWriteCollision"],
      routing_artifacts: ["single scheduled write intent", "live-head collision fence"],
      proof_artifacts: ["runScheduledWriteCollisionFenceProof"],
    },
    ...overrides,
  };
}

test("admits one live-head scheduled executable write intent", () => {
  const verdict = fenceScheduledWriteCollision(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_scheduled_write");
  assert.equal(verdict.intent_id, "scheduled-write-collision-fence-001");
  assert.ok(verdict.decisive_evidence.includes(`live head ${liveHead}`));
});

test("blocks an intent that is already open or completed", () => {
  const verdict = fenceScheduledWriteCollision(input({ open_intent_ids: ["scheduled-write-collision-fence-001"] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_intent_collision");
});

test("blocks scheduled writes compiled from stale observed heads", () => {
  const verdict = fenceScheduledWriteCollision(
    input({ candidate: { ...input().candidate, observed_head_sha: repairedHead } }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_observed_head");
  assert.match(verdict.blockers.join("; "), /live head/);
});

test("blocks repaired historical heads as write bases", () => {
  const verdict = fenceScheduledWriteCollision(
    input({
      live_head_sha: repairedHead,
      candidate: { ...input().candidate, observed_head_sha: repairedHead, base_head_sha: repairedHead },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_repaired_head_base");
});

test("blocks metadata rereads and duplicate status summaries inside the write lane", () => {
  const verdict = fenceScheduledWriteCollision(
    input({ candidate: { ...input().candidate, move_class: "metadata_reread" } }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_progress_move");
});

test("blocks repeated write classes", () => {
  const verdict = fenceScheduledWriteCollision(
    input({ spent_write_classes: ["scheduled_write_collision_fence"] }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_repeated_write_class");
});

test("blocks incomplete increments with no behavior-bearing file", () => {
  const verdict = fenceScheduledWriteCollision(
    input({
      candidate: {
        ...input().candidate,
        changed_files: ["platform/packages/route-governor/src/scheduled-write-collision-fence-proof.ts"],
        behavior_artifacts: [],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_increment");
});
