import assert from "node:assert/strict";

import {
  rebaseScheduledFinalizationToLiveHead,
  type ScheduledFinalizationHeadRebaseInput,
} from "./scheduled-finalization-head-rebase.js";

const branch = "monday-platform-genesis-01";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "1a0c8f200c4050ddb944284b7fd253ffc0b761dc";

function input(overrides: Partial<ScheduledFinalizationHeadRebaseInput> = {}): ScheduledFinalizationHeadRebaseInput {
  return {
    active_branch: branch,
    pr_branch: branch,
    prompt_head_sha: repairedHead,
    live_head_sha: liveHead,
    last_repaired_head_sha: repairedHead,
    repaired_head_status_resolved: true,
    blocker_issue_closed: true,
    blocker_label_present: false,
    candidate: {
      move_class: "external_platform_embodiment",
      base_head_sha: liveHead,
      changed_files: ["platform/packages/route-governor/src/scheduled-finalization-head-rebase.ts"],
      executable_artifacts: ["rebaseScheduledFinalizationToLiveHead"],
      routing_artifacts: ["stale prompt heads are quarantined before scheduled finalization moves are admitted"],
      status_surface_ids: [],
    },
    ...overrides,
  };
}

const embodiment = rebaseScheduledFinalizationToLiveHead(input());
assert.equal(embodiment.ok, true);
assert.equal(embodiment.action, "admit_live_head_external_embodiment");
assert.deepEqual(embodiment.quarantined_head_shas, [repairedHead]);

const staleBase = rebaseScheduledFinalizationToLiveHead(
  input({
    candidate: {
      move_class: "external_platform_embodiment",
      base_head_sha: repairedHead,
      changed_files: ["platform/packages/route-governor/src/scheduled-finalization-head-rebase.ts"],
      executable_artifacts: ["rebaseScheduledFinalizationToLiveHead"],
      routing_artifacts: ["stale prompt heads are quarantined"],
      status_surface_ids: [],
    },
  }),
);
assert.equal(staleBase.ok, false);
assert.equal(staleBase.action, "block_stale_prompt_head");

const replayedBlocker = rebaseScheduledFinalizationToLiveHead(
  input({
    candidate: {
      move_class: "replayed_repaired_head_blocker",
      base_head_sha: liveHead,
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      status_surface_ids: [],
      blocker: `old repaired-head status blocker for ${repairedHead}`,
    },
  }),
);
assert.equal(replayedBlocker.ok, false);
assert.equal(replayedBlocker.action, "block_replayed_repaired_head_blocker");

const readback = rebaseScheduledFinalizationToLiveHead(
  input({
    candidate: {
      move_class: "fresh_status_readback",
      base_head_sha: liveHead,
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      status_surface_ids: ["checks:live-head:1a0c8f200c4050ddb944284b7fd253ffc0b761dc"],
    },
  }),
);
assert.equal(readback.ok, true);
assert.equal(readback.action, "admit_live_head_status_readback");

const metadataReread = rebaseScheduledFinalizationToLiveHead(
  input({
    candidate: {
      move_class: "metadata_reread",
      base_head_sha: liveHead,
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      status_surface_ids: [],
    },
  }),
);
assert.equal(metadataReread.ok, false);
assert.equal(metadataReread.action, "block_non_progress_move");

console.log("scheduled finalization head rebase proof passed");
