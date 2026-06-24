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

function expectOk(name: string, ok: boolean, blockers: string[]): void {
  if (!ok) throw new Error(`${name} should pass, blocked by: ${blockers.join("; ")}`);
}

function expectBlock(name: string, ok: boolean, blockers: string[], expected: string): void {
  if (ok) throw new Error(`${name} should block, but passed`);
  if (!blockers.some((blocker) => blocker.includes(expected))) {
    throw new Error(`${name} did not block for ${expected}; blockers: ${blockers.join("; ")}`);
  }
}

export function runScheduledWriteCollisionFenceProof(): void {
  const admitted = fenceScheduledWriteCollision(input());
  expectOk("scheduled write collision fence", admitted.ok, admitted.blockers);
  if (admitted.action !== "admit_scheduled_write") {
    throw new Error(`unexpected action: ${admitted.action}`);
  }

  const duplicateIntent = fenceScheduledWriteCollision(
    input({ open_intent_ids: ["scheduled-write-collision-fence-001"] }),
  );
  expectBlock("duplicate scheduled intent", duplicateIntent.ok, duplicateIntent.blockers, "already active");

  const staleHead = fenceScheduledWriteCollision(
    input({ candidate: { ...input().candidate, observed_head_sha: repairedHead } }),
  );
  expectBlock("stale observed head", staleHead.ok, staleHead.blockers, "live head");

  const nonProgress = fenceScheduledWriteCollision(
    input({ candidate: { ...input().candidate, move_class: "metadata_reread" } }),
  );
  expectBlock("metadata reread write substitute", nonProgress.ok, nonProgress.blockers, "metadata_reread");

  const repeatedWrite = fenceScheduledWriteCollision(
    input({ spent_write_classes: ["scheduled_write_collision_fence"] }),
  );
  expectBlock("repeated write class", repeatedWrite.ok, repeatedWrite.blockers, "already spent");

  const staleStatus = fenceScheduledWriteCollision(
    input({ candidate: { ...input().candidate, status_claim_head_sha: repairedHead } }),
  );
  expectBlock("stale status substitute", staleStatus.ok, staleStatus.blockers, "not live head");
}

runScheduledWriteCollisionFenceProof();
